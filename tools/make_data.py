"""Builds the practice data files in data/files/. Run from the site folder:

    python3 tools/make_data.py

What is real and what is made up:
  md_energy.xvg    REAL. gmx energy output from the magainin 2 run captured for the
                   GROMACS visualizer (500 ps, 1 ps per row). Copied, not built here.
  md_rmsd.xvg      REAL. C-alpha RMSD of the same run, computed here from the saved
                   frames (tools/magainin2_frames.gro, every 5 ps) after fitting each
                   frame onto the first one.
  md_rmsf.xvg      REAL. Per-residue C-alpha RMSF from the same frames.
  campaigns.csv    REAL. Accepted designs per BindCraft2 campaign, from the BC2 site.
  plddt.csv        EXAMPLE. A made-up pLDDT profile for a 117-residue helical bundle.
  designs.csv      EXAMPLE. Made-up iPTM / ipAE / RMSD values for 96 designs in three
                   runs, shaped like the RFD4 runs but NOT the real numbers.
  pae.csv          EXAMPLE. A made-up 197 x 197 predicted aligned error matrix for a
                   binder (80 residues) bound to a target (117 residues).
The lesson text says which files are examples, so students are never told a made-up
number is a measurement.
"""
import csv
import os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'files')
rng = np.random.default_rng(662)


def read_gro_frames(path):
    frames, times, names = [], [], None
    with open(path) as f:
        lines = f.read().splitlines()
    i = 0
    while i < len(lines):
        title = lines[i]
        n = int(lines[i + 1])
        atoms = lines[i + 2:i + 2 + n]
        t = float(title.split('t=')[1].split()[0])
        xyz, res = [], []
        for a in atoms:
            if a[10:15].strip() == 'CA':
                xyz.append([float(a[20:28]), float(a[28:36]), float(a[36:44])])
                res.append((int(a[0:5]), a[5:10].strip()))
        frames.append(np.array(xyz))
        times.append(t)
        names = res
        i += n + 3
    return np.array(times), np.array(frames), names


def kabsch_fit(mobile, ref):
    mc, rc = mobile.mean(0), ref.mean(0)
    a, b = mobile - mc, ref - rc
    u, s, vt = np.linalg.svd(a.T @ b)
    d = np.sign(np.linalg.det(u @ vt))
    rot = u @ np.diag([1, 1, d]) @ vt
    return a @ rot + rc


def xvg(path, title, xlabel, ylabel, legend, rows, note):
    with open(path, 'w') as f:
        f.write(f'# {note}\n')
        f.write(f'@    title "{title}"\n@    xaxis  label "{xlabel}"\n@    yaxis  label "{ylabel}"\n@TYPE xy\n')
        f.write(f'@ s0 legend "{legend}"\n')
        for x, y in rows:
            f.write(f'{x:12.4f} {y:12.5f}\n')


def md_files():
    t, fr, res = read_gro_frames(os.path.join(HERE, 'magainin2_frames.gro'))
    fitted = np.array([kabsch_fit(f, fr[0]) for f in fr])
    rmsd = np.sqrt(((fitted - fr[0]) ** 2).sum(-1).mean(-1))
    xvg(os.path.join(OUT, 'md_rmsd.xvg'), 'RMSD', 'Time (ps)', 'RMSD (nm)', 'C-alpha after fit',
        zip(t, rmsd), 'C-alpha RMSD of the magainin 2 run, each frame fitted onto the first (tools/make_data.py)')
    mean = fitted.mean(0)
    rmsf = np.sqrt(((fitted - mean) ** 2).sum(-1).mean(0))
    xvg(os.path.join(OUT, 'md_rmsf.xvg'), 'RMS fluctuation', 'Residue', '(nm)', 'C-alpha',
        zip([r for r, _ in res], rmsf), 'C-alpha RMSF of the magainin 2 run (tools/make_data.py)')
    return len(t), len(res)


def plddt():
    n = 117
    helices = [(4, 28), (38, 58), (66, 88), (98, 114)]
    base = np.full(n, 62.0)
    for a, b in helices:
        base[a:b] = 91
        base[max(a - 3, 0):a] = np.linspace(62, 91, len(base[max(a - 3, 0):a]))
        base[b:b + 3] = np.linspace(91, 62, len(base[b:b + 3]))
    base[:4] = [35, 41, 48, 55]
    base[-3:] = [58, 47, 38]
    vals = np.clip(base + rng.normal(0, 3.0, n), 20, 98.5)
    with open(os.path.join(OUT, 'plddt.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['residue', 'plddt'])
        for i, v in enumerate(vals, start=17):
            w.writerow([i, f'{v:.2f}'])


def designs():
    runs = [('unguided', 0.10, 0.04, 19.0), ('face_A', 0.24, 0.12, 12.0), ('face_B', 0.11, 0.04, 17.5)]
    rows = []
    for run, mu, sd, pae_mu in runs:
        for i in range(32):
            iptm = float(np.clip(rng.normal(mu, sd), 0.03, 0.9))
            ipae = float(np.clip(pae_mu - 22 * (iptm - mu) + rng.normal(0, 1.6), 3.0, 30))
            rmsd = float(np.clip(14 - 18 * iptm + rng.normal(0, 1.5), 0.8, 20))
            length = int(rng.integers(80, 111))
            rows.append([f'{run}_{i:02d}', run, length, f'{iptm:.3f}', f'{ipae:.2f}', f'{rmsd:.2f}'])
    with open(os.path.join(OUT, 'designs.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['design', 'run', 'length', 'iptm', 'ipae', 'rmsd'])
        w.writerows(rows)


def pae():
    nb, nt = 80, 117
    n = nb + nt
    idx = np.arange(n)
    m = np.empty((n, n))
    for i in range(n):
        for j in range(n):
            same = (i < nb) == (j < nb)
            m[i, j] = (2.0 + 0.04 * abs(i - j)) if same else 24.0
    # an interface: binder 20-45 against target residues 43-66 (index 80+26 .. 80+49)
    for i in range(20, 46):
        for j in range(nb + 26, nb + 50):
            m[i, j] = m[j, i] = 6.0 + abs(i - 33) * 0.25
    m += rng.normal(0, 0.6, (n, n))
    m = np.clip(m, 0.5, 31.75)
    np.savetxt(os.path.join(OUT, 'pae.csv'), m, delimiter=',', fmt='%.2f')


def campaigns():
    rows = [['campaign', 'trajectories', 'accepted'],
            ['3EVG unguided', 40, 1], ['IL-15 unguided', 200, 41],
            ['IL-15 Face A', 200, 27], ['IL-15 Face B', 200, 0]]
    with open(os.path.join(OUT, 'campaigns.csv'), 'w', newline='') as f:
        csv.writer(f).writerows(rows)


if __name__ == '__main__':
    print('md frames, residues:', md_files())
    plddt(); designs(); pae(); campaigns()
    print('wrote', sorted(os.listdir(OUT)))
