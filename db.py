import os
import json
import threading

MONGODB_URI = os.environ.get("MONGODB_URI", "")
BASE = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE, "data")
os.makedirs(DATA_DIR, exist_ok=True)

db = None
DB_STATUS = "local_files"
_db_lock = threading.Lock()

def init_db():
    global db, DB_STATUS
    if not MONGODB_URI:
        print("[db] No MONGODB_URI — using local JSON files")
        DB_STATUS = "local_files"
        return
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client["mayrhofen_tracker"]
        DB_STATUS = "mongodb"
        print(f"[db] MongoDB connected: {DB_STATUS}")
    except Exception as e:
        print(f"[db] MongoDB failed: {e} — using local JSON files")
        DB_STATUS = "local_files"

def _local_path(collection):
    return os.path.join(DATA_DIR, f"{collection}.json")

def _load_local(collection):
    path = _local_path(collection)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_local(collection, docs):
    path = _local_path(collection)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

def find_one(collection, query):
    if db is not None:
        doc = db[collection].find_one(query, {"_id": 0})
        return doc
    docs = _load_local(collection)
    for doc in docs:
        match = all(doc.get(k) == v for k, v in query.items())
        if match:
            return doc
    return None

def find_many(collection, query=None):
    if db is not None:
        cursor = db[collection].find(query or {}, {"_id": 0})
        return list(cursor)
    docs = _load_local(collection)
    if not query:
        return docs
    result = []
    for doc in docs:
        match = all(doc.get(k) == v for k, v in query.items())
        if match:
            result.append(doc)
    return result

def upsert_one(collection, query, doc):
    if db is not None:
        db[collection].replace_one(query, doc, upsert=True)
        return
    with _db_lock:
        docs = _load_local(collection)
        for i, d in enumerate(docs):
            match = all(d.get(k) == v for k, v in query.items())
            if match:
                docs[i] = doc
                _save_local(collection, docs)
                return
        docs.append(doc)
        _save_local(collection, docs)

def insert_one(collection, doc):
    if db is not None:
        db[collection].insert_one({**doc})
        return
    with _db_lock:
        docs = _load_local(collection)
        docs.append(doc)
        _save_local(collection, docs)

def delete_one(collection, query):
    if db is not None:
        db[collection].delete_one(query)
        return
    with _db_lock:
        docs = _load_local(collection)
        new_docs = []
        deleted = False
        for doc in docs:
            if not deleted and all(doc.get(k) == v for k, v in query.items()):
                deleted = True
            else:
                new_docs.append(doc)
        _save_local(collection, new_docs)
