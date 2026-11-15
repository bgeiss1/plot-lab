"""Runs a student's code, draws their figures, and checks them.

The browser loads this file into Pyodide (js/worker.js). The tests load the same file into
ordinary Python (tests/check_solutions.py), so a solution that passes here passes in the
browser too.

run(code, check) returns a JSON string:
  {"stdout": "...", "error": null or {"line": n, "kind": "...", "message": "...", "help": "..."},
   "figures": ["<base64 png>", ...], "results": [{"ok": true, "what": "...", "hint": "..."}, ...],
   "checked": true or false}

Check code is ordinary Python written by the instructor. It calls check(what, condition, hint)
once per thing it wants to confirm. The helpers below read the figure the student made, so a
check never depends on how the student wrote their code, only on what the plot shows.
"""
import base64
import contextlib
import io
import json
import os
import sys
import traceback

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.collections import PathCollection, PolyCollection  # noqa: E402
from matplotlib.container import BarContainer, ErrorbarContainer  # noqa: E402
from matplotlib.image import AxesImage  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

STUDENT_FILE = '<your code>'
plt.show = lambda *a, **k: None  # the page shows every figure, so plt.show() has nothing to do
# Python stays running between Runs, so a line like plt.xlabel = "Residue" would break every
# later Run. Each Run puts these modules back the way they were first loaded.
_PRISTINE = {m: dict(vars(m)) for m in (plt, np, matplotlib)}


def _restore_modules():
    for m, saved in _PRISTINE.items():
        d = vars(m)
        for k in [k for k in d if k not in saved]:
            del d[k]
        d.update(saved)

# ---------------------------------------------------------------- reading the figure


def figs():
    return [plt.figure(n) for n in plt.get_fignums()]


def fig():
    f = figs()
    return f[0] if f else None


def axes(f=None):
    """The plotting axes of a figure, left to right then top to bottom. Colorbars are left out."""
    f = f or fig()
    if f is None:
        return []
    out = [a for a in f.get_axes() if a.get_label() != '<colorbar>' and not hasattr(a, '_colorbar')]
    return sorted(out, key=lambda a: (-round(a.get_position().y0, 2), round(a.get_position().x0, 2)))


def ax(i=0):
    a = axes()
    return a[i] if -len(a) <= i < len(a) else None


def _a(i):
    return i if hasattr(i, 'get_lines') else ax(i)


def xlabel(i=0):
    a = _a(i)
    return a.get_xlabel() if a else ''


def ylabel(i=0):
    a = _a(i)
    return a.get_ylabel() if a else ''


def title(i=0):
    a = _a(i)
    if not a:
        return ''
    return ' '.join(t for t in (a.get_title('left'), a.get_title(), a.get_title('right')) if t)


def suptitle():
    f = fig()
    s = getattr(f, '_suptitle', None) if f else None
    return s.get_text() if s else ''


def xlim(i=0):
    a = _a(i)
    return tuple(a.get_xlim()) if a else (None, None)


def ylim(i=0):
    a = _a(i)
    return tuple(a.get_ylim()) if a else (None, None)


def xscale(i=0):
    a = _a(i)
    return a.get_xscale() if a else ''


def yscale(i=0):
    a = _a(i)
    return a.get_yscale() if a else ''


def _is_refline(line):
    """True for lines drawn by axhline / axvline (they span the axes, not the data)."""
    x, y = list(line.get_xdata()), list(line.get_ydata())
    if len(x) != 2 or len(y) != 2 or line.get_transform() == line.axes.transData:
        return False
    return (x == [0, 1] and y[0] == y[1]) or (y == [0, 1] and x[0] == x[1])


def lines(i=0):
    """Data lines from plot(). Reference lines from axhline/axvline are left out."""
    a = _a(i)
    if not a:
        return []
    return [ln for ln in a.get_lines() if not _is_refline(ln)]


def line_x(i=0, k=0):
    ln = lines(i)
    return np.asarray(ln[k].get_xdata(), dtype=float) if len(ln) > k else np.empty(0)


def line_y(i=0, k=0):
    ln = lines(i)
    return np.asarray(ln[k].get_ydata(), dtype=float) if len(ln) > k else np.empty(0)


def reflines(i=0, kind=None):
    """Lines from axhline (kind='h') or axvline (kind='v'), as (kind, value) pairs."""
    a = _a(i)
    out = []
    if not a:
        return out
    for ln in a.get_lines():
        if not _is_refline(ln):
            continue
        x, y = list(ln.get_xdata()), list(ln.get_ydata())
        if x == [0, 1] and y[0] == y[1]:
            out.append(('h', float(y[0])))
        elif y == [0, 1] and x[0] == x[1]:
            out.append(('v', float(x[0])))
    return [o for o in out if kind is None or o[0] == kind]


def has_hline(value, i=0, tol=1e-6):
    return any(abs(v - value) <= tol for _, v in reflines(i, 'h'))


def has_vline(value, i=0, tol=1e-6):
    return any(abs(v - value) <= tol for _, v in reflines(i, 'v'))


def scatters(i=0):
    a = _a(i)
    return [c for c in a.collections if isinstance(c, PathCollection)] if a else []


def scatter_xy(i=0, k=0):
    s = scatters(i)
    return np.asarray(s[k].get_offsets()) if len(s) > k else np.empty((0, 2))


def bars(i=0):
    """Rectangles from bar() / barh(), one list per call."""
    a = _a(i)
    return [list(c) for c in a.containers if isinstance(c, BarContainer)] if a else []


def bar_heights(i=0, k=0):
    b = bars(i)
    return [r.get_height() for r in b[k]] if len(b) > k else []


def hist_patches(i=0):
    """Every rectangle on the axes that is not the axes background (hist() makes these)."""
    a = _a(i)
    return [p for p in a.patches if isinstance(p, Rectangle)] if a else []


def errorbars(i=0):
    a = _a(i)
    return [c for c in a.containers if isinstance(c, ErrorbarContainer)] if a else []


def fills(i=0):
    a = _a(i)
    return [c for c in a.collections if isinstance(c, PolyCollection)] if a else []


def images(i=0):
    a = _a(i)
    return [im for im in a.get_images() if isinstance(im, AxesImage)] if a else []


def colorbars():
    f = fig()
    return [a for a in f.get_axes() if a.get_label() == '<colorbar>' or hasattr(a, '_colorbar')] if f else []


def legend_texts(i=0):
    a = _a(i)
    lg = a.get_legend() if a else None
    if lg is None and fig() is not None and fig().legends:
        lg = fig().legends[0]
    return [t.get_text() for t in lg.get_texts()] if lg else []


def has_legend(i=0):
    a = _a(i)
    return bool(a and (a.get_legend() is not None or (fig() is not None and fig().legends)))


def texts(i=0):
    a = _a(i)
    return [t.get_text() for t in a.texts] if a else []


def has_grid(i=0):
    a = _a(i)
    if not a:
        return False
    return any(g.get_visible() for g in a.xaxis.get_gridlines() + a.yaxis.get_gridlines())


def color_of(artist):
    """The colour of a line, scatter or bar as an (r, g, b) tuple, rounded."""
    from matplotlib.colors import to_rgb
    if hasattr(artist, 'get_color') and not isinstance(artist, PathCollection):
        c = artist.get_color()
    elif hasattr(artist, 'get_facecolor'):
        c = artist.get_facecolor()
        c = c[0] if np.ndim(c) == 2 and len(c) else c
    else:
        return None
    return tuple(round(v, 3) for v in to_rgb(c))


def same_color(artist, name):
    from matplotlib.colors import to_rgb
    c = color_of(artist)
    return c is not None and np.allclose(c, to_rgb(name), atol=0.02)


# ---------------------------------------------------------------- comparing things


def has_words(text, *words):
    """True when every word appears in text, ignoring case."""
    t = str(text).lower()
    return bool(t.strip()) and all(w.lower() in t for w in words)


def same(a, b, tol=1e-6):
    """True when two arrays have the same shape and values (within tol)."""
    try:
        a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    except (TypeError, ValueError):
        return False
    return a.shape == b.shape and np.allclose(a, b, atol=tol, rtol=1e-6, equal_nan=True)


def xvg(path):
    """Reads a GROMACS .xvg file the same way the lessons teach."""
    return np.loadtxt(path, comments=['#', '@'])


def csv_columns(path):
    """A CSV file with a header row as a dict of numpy columns (text columns stay text)."""
    import csv
    with open(path) as f:
        rows = list(csv.DictReader(f))
    out = {}
    for k in rows[0]:
        vals = [r[k] for r in rows]
        try:
            out[k] = np.array(vals, dtype=float)
        except ValueError:
            out[k] = np.array(vals)
    return out


def saved(name):
    """Facts about a file the student saved with savefig: exists, width, height, dpi, format."""
    info = {'exists': os.path.exists(name), 'width': 0, 'height': 0, 'dpi': 0, 'format': ''}
    if not info['exists']:
        return info
    info['format'] = os.path.splitext(name)[1].lstrip('.').lower()
    if info['format'] == 'png':
        from PIL import Image
        with Image.open(name) as im:
            info['width'], info['height'] = im.size
            d = im.info.get('dpi')
            info['dpi'] = round(float(d[0])) if d else 0
    elif info['format'] in ('svg', 'pdf'):
        info['width'] = os.path.getsize(name)
    return info


# ---------------------------------------------------------------- running student code


class _Checks:
    def __init__(self):
        self.results = []

    def check(self, what, condition, hint=''):
        try:
            ok = bool(condition() if callable(condition) else condition)
        except Exception as e:  # a check that cannot run counts as not passed
            ok = False
            hint = hint or f'(The check stopped with {type(e).__name__}: {e})'
        self.results.append({'ok': ok, 'what': what, 'hint': '' if ok else hint})
        return ok


FRIENDLY = [
    ("No module named 'matplotlib.pyplot'", 'Check the spelling: it is import matplotlib.pyplot as plt.'),
    ("name 'plt' is not defined", 'Start with import matplotlib.pyplot as plt, so Python knows what plt means.'),
    ("name 'np' is not defined", 'Add import numpy as np at the top.'),
    ('x and y must have same first dimension', 'Your x and y have different lengths. Print len(x) and len(y) to see which one is off.'),
    ('No such file or directory', 'Python cannot find a file with that name. Check the spelling against the file name in the task, including the ending (.csv or .xvg).'),
    ('could not convert string to float', 'Some rows are not numbers. A header row needs skiprows=1, and an .xvg file needs comments=["#", "@"].'),
    ('too many indices for array', 'The array has fewer columns than you asked for. Print data.shape to see its size.'),
    ("'float' object cannot be interpreted as an integer", 'Something here only takes whole numbers. For steps like 0.25, use np.arange instead of range.'),
    ("'Axes' object has no attribute", 'That name does not exist on this object. On an Axes the labelling calls start with set_, as in ax.set_xlabel.'),
    ('unexpected indent', 'A line starts with spaces it should not have. Line it up with the lines around it.'),
    ('invalid syntax', 'Python could not read this line. Look for a missing bracket, quote or comma, often on the line before.'),
    ('unterminated string', 'A quote was opened and never closed.'),
    ("'(' was never closed", 'A bracket was opened and never closed.'),
]


def _explain(message):
    for needle, text in FRIENDLY:
        if needle in message:
            return text
    return ''


def _error_info(exc):
    if isinstance(exc, SyntaxError):
        msg = exc.msg
        return {'line': exc.lineno, 'kind': type(exc).__name__, 'message': msg, 'help': _explain(msg)}
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == STUDENT_FILE]
    line = frames[-1].lineno if frames else None
    msg = str(exc)
    if isinstance(exc, FileNotFoundError):
        name = exc.filename or msg.replace(' not found.', '')
        msg = f'No such file or directory: {name!r}'
    return {'line': line, 'kind': type(exc).__name__, 'message': msg, 'help': _explain(msg) or _explain(type(exc).__name__)}


def _render(dpi):
    out = []
    for f in figs():
        buf = io.BytesIO()
        f.savefig(buf, format='png', dpi=dpi)
        out.append(base64.b64encode(buf.getvalue()).decode('ascii'))
    return out


HELPERS = {k: v for k, v in dict(globals()).items() if not k.startswith('_') and callable(v) and k != 'run'}


def run(code, check=None, dpi=90, render=True):
    _restore_modules()
    plt.close('all')
    plt.rcdefaults()
    ns = {'__name__': '__main__'}
    out = io.StringIO()
    error = None
    try:
        compiled = compile(code, STUDENT_FILE, 'exec')
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            exec(compiled, ns)
    except BaseException as e:  # noqa: BLE001  a student's SystemExit should not stop the page
        error = _error_info(e)
    figures = []
    if render:
        try:
            figures = _render(dpi)
        except Exception as e:  # e.g. a bad colour only fails when drawn
            if error is None:
                error = _error_info(e)
    results, checked = [], False
    if check and error is None:
        c = _Checks()
        env = dict(HELPERS)
        env.update({'check': c.check, 'np': np, 'plt': plt, 'var': ns.get, 'student': ns, 'printed': out.getvalue()})
        try:
            exec(compile(check, '<check>', 'exec'), env)
        except Exception as e:
            c.results.append({'ok': False, 'what': 'Finish checking the plot',
                              'hint': f'The checker stopped early ({type(e).__name__}: {e}). Is there a plot yet?'})
        results, checked = c.results, True
    return json.dumps({'stdout': out.getvalue()[-20000:], 'error': error, 'figures': figures,
                       'results': results, 'checked': checked})
