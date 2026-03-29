#!/usr/bin/env python3
"""Seed MongoDB with resort data from static JSON files."""
import os, json, sys

# Load env
MONGODB_URI = os.environ.get("MONGODB_URI", "")
if not MONGODB_URI:
    print("ERROR: MONGODB_URI not set")
    sys.exit(1)

import db as _db
_db.init_db()

BASE = os.path.dirname(__file__)

def load_json(name):
    with open(os.path.join(BASE, 'static', 'data', name), 'r', encoding='utf-8') as f:
        return json.load(f)

def seed(collection, data, key='id'):
    existing = _db.find_many(collection)
    if existing:
        print(f"[seed] {collection}: already has {len(existing)} docs — skipping (use --force to reset)")
        return
    for doc in data:
        _db.insert_one(collection, doc)
    print(f"[seed] {collection}: inserted {len(data)} docs")

force = '--force' in sys.argv
if force:
    for col in ['slopes', 'lifts', 'pois']:
        if _db.db:
            _db.db[col].drop()
        print(f"[seed] dropped {col}")

seed('slopes', load_json('slopes.json'))
seed('lifts',  load_json('lifts.json'))
seed('pois',   load_json('pois.json'))
print("[seed] Done!")
