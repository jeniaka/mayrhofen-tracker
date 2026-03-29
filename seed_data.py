#!/usr/bin/env python3
"""
Seed MongoDB with complete Mayrhofen resort data (2025 official piste map).
Usage:
  python seed_data.py              # seed only if collections are empty
  python seed_data.py --force      # drop and re-seed all collections
"""
import os, json, sys

MONGODB_URI = os.environ.get("MONGODB_URI", "")
if not MONGODB_URI:
    print("ERROR: MONGODB_URI not set")
    sys.exit(1)

import db as _db
_db.init_db()

BASE = os.path.dirname(__file__)

def load_json(name):
    path = os.path.join(BASE, 'static', 'data', name)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

force = '--force' in sys.argv

if force and _db.db is not None:
    for col in ['slopes', 'lifts', 'pois']:
        _db.db[col].drop()
        print(f"[seed] dropped {col}")
elif force:
    # local JSON fallback — overwrite files from static source
    import shutil
    for col in ['slopes', 'lifts', 'pois']:
        src = os.path.join(BASE, 'static', 'data', f'{col}.json')
        dst = os.path.join(BASE, 'data', f'{col}.json')
        shutil.copy(src, dst)
        print(f"[seed] reset local {col}.json from static source")

def seed(collection, filename):
    data = load_json(filename)
    if not force:
        existing = _db.find_many(collection)
        if existing:
            print(f"[seed] {collection}: already has {len(existing)} docs — skipping (use --force)")
            return
    for doc in data:
        _db.insert_one(collection, doc)
    print(f"[seed] {collection}: inserted {len(data)} docs")

seed('slopes', 'slopes.json')
seed('lifts',  'lifts.json')
seed('pois',   'pois.json')
print("[seed] Done!")

# Print summary
for col in ['slopes', 'lifts', 'pois']:
    docs = _db.find_many(col)
    diff_counts = {}
    if col == 'slopes':
        for d in docs:
            k = d.get('difficulty','?')
            diff_counts[k] = diff_counts.get(k, 0) + 1
        print(f"  {col}: {len(docs)} total — {diff_counts}")
    else:
        type_counts = {}
        for d in docs:
            k = d.get('type', d.get('sector', '?'))
            type_counts[k] = type_counts.get(k, 0) + 1
        print(f"  {col}: {len(docs)} total")
