"""Runs every exercise in data/lessons.json through py/plotlab.py in ordinary Python.

For each exercise:
  * the answer (solution) must run without an error and pass every check
  * the starting code (starter) must NOT pass every check, or the exercise would be done
    before the student touched it

Needs Python 3 with numpy and matplotlib (pip install numpy matplotlib). tests/run.mjs runs
this when such a Python is available and says so plainly when it is not.

    python3 tests/check_solutions.py            # every exercise
    python3 tests/check_solutions.py heatmaps   # one lesson
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'py'))
os.chdir(os.path.join(ROOT, 'data', 'files'))
import plotlab  # noqa: E402

site = json.load(open(os.path.join(ROOT, 'data', 'lessons.json')))
only = sys.argv[1:]
fails = 0
count = 0
for lesson in site['lessons']:
    if only and lesson['id'] not in only:
        continue
    for ex in lesson['exercises']:
        count += 1
        name = f"{lesson['id']}/{ex['id']}"
        before = set(os.listdir('.'))
        sol = json.loads(plotlab.run(ex['solution'], ex['check'], render=False))
        for f in set(os.listdir('.')) - before:  # files the answer saved
            os.remove(f)
        problems = []
        if sol['error']:
            problems.append(f"answer stops with {sol['error']['kind']} on line {sol['error']['line']}: {sol['error']['message']}")
        if not sol['results']:
            problems.append('answer: the check code made no checks')
        problems += [f"answer fails: {r['what']} ({r['hint']})" for r in sol['results'] if not r['ok']]
        st = json.loads(plotlab.run(ex['starter'], ex['check'], render=False))
        for f in set(os.listdir('.')) - before:
            os.remove(f)
        if not st['error'] and st['results'] and all(r['ok'] for r in st['results']):
            problems.append('starting code already passes every check')
        if problems:
            fails += 1
            print(f'FAIL {name}')
            for p in problems:
                print('   ', p)
        else:
            why = st['error']['kind'] if st['error'] else f"{sum(not r['ok'] for r in st['results'])} of {len(st['results'])} checks"
            print(f"ok   {name}  ({len(sol['results'])} checks pass; starter fails: {why})")
print(f'\n{count - fails} of {count} exercises pass')
sys.exit(1 if fails else 0)
