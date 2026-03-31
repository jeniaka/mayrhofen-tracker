"""
Fetch accurate ski slope and lift data from OpenStreetMap Overpass API
for the Mayrhofen / Zillertal ski area.
Run once: python fetch_osm_data.py
Creates static/data/osm_slopes.json, osm_lifts.json, osm_pois.json
"""
import json
import time
import urllib.request
import urllib.parse
import os

OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter"
# Bounding box: south, west, north, east — covers Mayrhofen + Hintertux
BBOX = "47.06,11.62,47.22,11.95"

def query_overpass(query, retries=3):
    for attempt in range(retries):
        if attempt > 0:
            wait = 15 * attempt
            print(f"  Retry {attempt}/{retries-1} after {wait}s...")
            time.sleep(wait)
        try:
            encoded = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(OVERPASS_URL, data=encoded, method="POST")
            req.add_header("User-Agent", "MayrhofenTracker/1.0")
            with urllib.request.urlopen(req, timeout=90) as resp:
                raw = resp.read()
                if not raw or not raw.strip():
                    raise ValueError("Empty response from Overpass API")
                return json.loads(raw)
        except Exception as e:
            print(f"  Overpass error (attempt {attempt+1}): {e}")
            if attempt == retries - 1:
                raise
    return {"elements": []}

def fetch_pistes():
    query = f"""
[out:json][timeout:60];
(
  way["piste:type"="downhill"]({BBOX});
  way["piste:type"="skitour"]({BBOX});
);
out body;
>;
out skel qt;
"""
    print("Fetching pistes from OSM")
    result = query_overpass(query)
    nodes = {el["id"]: [el["lat"], el["lon"]]
             for el in result.get("elements", []) if el["type"] == "node"}

    diff_map = {
        "novice": "blue", "easy": "blue",
        "intermediate": "red",
        "advanced": "black", "expert": "black", "freeride": "black",
    }
    slopes = []
    for el in result.get("elements", []):
        if el["type"] != "way":
            continue
        tags = el.get("tags", {})
        coords = [nodes[n] for n in el.get("nodes", []) if n in nodes]
        if len(coords) < 2:
            continue
        diff = diff_map.get(tags.get("piste:difficulty", ""), "red")
        name = tags.get("piste:name") or tags.get("name") or ""
        ref  = tags.get("piste:ref")  or tags.get("ref")  or ""
        slopes.append({
            "id":          f"osm_{el['id']}",
            "osm_id":      el["id"],
            "name":        name,
            "number":      ref,
            "difficulty":  diff,
            "sector":      "mayrhofen",
            "status":      "open",
            "coordinates": coords,
            "length_m":    None,
        })
    print(f"  -> {len(slopes)} piste ways")
    return slopes

def fetch_lifts():
    query = f"""
[out:json][timeout:60];
(
  way["aerialway"]({BBOX});
);
out body;
>;
out skel qt;
"""
    print("Fetching lifts from OSM...")
    result = query_overpass(query)
    nodes = {el["id"]: [el["lat"], el["lon"]]
             for el in result.get("elements", []) if el["type"] == "node"}

    type_map = {
        "gondola":      "gondola",
        "cable_car":    "gondola",
        "chair_lift":   "chairlift",
        "drag_lift":    "tbar",
        "t-bar":        "tbar",
        "j-bar":        "tbar",
        "platter":      "tbar",
        "magic_carpet": "carpet",
        "mixed_lift":   "gondola",
    }
    lifts = []
    for el in result.get("elements", []):
        if el["type"] != "way":
            continue
        tags = el.get("tags", {})
        coords = [nodes[n] for n in el.get("nodes", []) if n in nodes]
        if len(coords) < 2:
            continue
        atype = tags.get("aerialway", "")
        lifts.append({
            "id":                 f"osm_{el['id']}",
            "osm_id":             el["id"],
            "name":               tags.get("name") or atype.replace("_", " ").title(),
            "type":               type_map.get(atype, "chairlift"),
            "sector":             "mayrhofen",
            "status":             "open",
            "capacity_per_hour":  tags.get("aerialway:capacity"),
            "bottom":             coords[0],
            "top":                coords[-1],
            "coordinates":        coords,
        })
    print(f"  -> {len(lifts)} aerialway ways")
    return lifts

def fetch_pois():
    query = f"""
[out:json][timeout:60];
(
  node["tourism"="alpine_hut"]({BBOX});
  node["aerialway"="station"]({BBOX});
);
out body;
"""
    print("Fetching POIs from OSM")
    try:
        result = query_overpass(query)
    except Exception as e:
        print(f"  POI fetch failed: {e}")
        return []
    pois = []
    for el in result.get("elements", []):
        if el["type"] != "node":
            continue
        tags = el.get("tags", {})
        name = tags.get("name", "")
        if not name:
            continue
        if tags.get("tourism") == "alpine_hut":
            poi_type = "restaurant"
        elif tags.get("aerialway") == "station":
            poi_type = "attraction"
        else:
            poi_type = "restaurant"
        pois.append({
            "id":          f"osm_{el['id']}",
            "name":        name,
            "type":        poi_type,
            "sector":      "mayrhofen",
            "lat":         el["lat"],
            "lng":         el["lon"],
            "description": tags.get("description") or tags.get("cuisine") or "",
            "hours":       tags.get("opening_hours") or "",
        })
    print(f"  -> {len(pois)} POIs")
    return pois

def main():
    out_dir = os.path.join(os.path.dirname(__file__), "static", "data")
    os.makedirs(out_dir, exist_ok=True)

    slopes = []
    lifts = []
    pois = []
    try:
        slopes = fetch_pistes()
    except Exception as e:
        print(f"Slopes fetch failed: {e}")
    time.sleep(10)
    try:
        lifts = fetch_lifts()
    except Exception as e:
        print(f"Lifts fetch failed: {e}")
    time.sleep(10)
    try:
        pois = fetch_pois()
    except Exception as e:
        print(f"POIs fetch failed: {e}")

    for fname, data in [
        ("osm_slopes.json", slopes),
        ("osm_lifts.json",  lifts),
        ("osm_pois.json",   pois),
    ]:
        path = os.path.join(out_dir, fname)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(data)} items -> {fname}")

    print(f"\nDone! {len(slopes)} slopes, {len(lifts)} lifts, {len(pois)} POIs")

if __name__ == "__main__":
    main()
