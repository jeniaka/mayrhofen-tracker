#!/usr/bin/env python3
"""MayrhofenTracker — main HTTP server"""
import os, json, re, secrets, time, threading, queue, uuid, math
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs
from datetime import datetime

import db as _db
import auth as _auth

PORT = int(os.environ.get("PORT", 8080))
BASE = os.path.dirname(__file__)
STATIC_DIR    = os.path.join(BASE, "static")
TEMPLATES_DIR = os.path.join(BASE, "templates")

# ── mime types ──────────────────────────────────────────────────────────────
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".webp": "image/webp",
    ".woff2":"font/woff2",
}

SECURITY_HEADERS = {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
}

# ────────────────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default logging

    def send_response_only(self, code, message=None):
        super().send_response_only(code, message)

    def ok(self, content_type, body, code=200):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json_ok(self, data, code=200):
        self.ok("application/json", json.dumps(data), code)

    def redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def error(self, code, msg="Error"):
        self.ok("application/json", json.dumps({"error": msg}), code)

    def set_session_cookie(self, cookie_val):
        self.send_response(302)
        self.send_header("Location", "/")
        self.send_header("Set-Cookie",
            f"session={cookie_val}; Path=/; HttpOnly; SameSite=Lax; Max-Age={_auth.SESSION_MAX_AGE}")
        self.end_headers()

    def clear_session_cookie(self):
        self.send_response(302)
        self.send_header("Location", "/")
        self.send_header("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0")
        self.end_headers()

    def get_session(self):
        raw = self.headers.get("Cookie", "")
        c = SimpleCookie()
        c.load(raw)
        if "session" not in c:
            return None
        return _auth.verify_session_cookie(c["session"].value)

    def get_host(self):
        return self.headers.get("Host", f"localhost:{PORT}")

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return b""
        return self.rfile.read(length)

    def read_json(self):
        body = self.read_body()
        try:
            return json.loads(body)
        except Exception:
            return {}

    # ── serve static files ──────────────────────────────────────────────────
    def serve_static(self, path):
        full = os.path.realpath(os.path.join(STATIC_DIR, path.lstrip("/")))
        if not full.startswith(os.path.realpath(STATIC_DIR)):
            self.error(403, "Forbidden")
            return
        if not os.path.isfile(full):
            self.error(404, "Not found")
            return
        ext = os.path.splitext(full)[1].lower()
        ct = MIME.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self.ok(ct, data)

    # ── serve SPA shell ─────────────────────────────────────────────────────
    def serve_app(self):
        tpl = os.path.join(TEMPLATES_DIR, "index.html")
        with open(tpl, "r", encoding="utf-8") as f:
            html = f.read()
        user = self.get_session()
        if user:
            html = html.replace("{{USER_JSON}}", json.dumps(user))
            html = html.replace("{{LOGGED_IN}}", "true")
        else:
            html = html.replace("{{USER_JSON}}", "null")
            html = html.replace("{{LOGGED_IN}}", "false")
        self.ok("text/html; charset=utf-8", html)

    # ────────────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        qs     = parse_qs(parsed.query)

        # Root → home
        if path == "/":
            self.redirect("/home")
            return

        # Health check
        if path == "/api/health":
            self.json_ok({"status": "ok", "db": _db.DB_STATUS, "ts": int(time.time())})
            return

        # Static files
        if path.startswith("/static/"):
            self.serve_static(path[len("/static/"):])
            return

        # manifest + sw
        if path == "/manifest.json":
            self.serve_static("manifest.json")
            return
        if path == "/sw.js":
            self.serve_static("js/sw.js")
            return
        if path == "/favicon.ico":
            self.serve_static("icons/favicon.ico")
            return

        # OAuth start
        if path == "/auth/login":
            url, state = _auth.build_auth_url(self.get_host())
            self.send_response(302)
            self.send_header("Location", url)
            self.send_header("Set-Cookie", f"oauth_state={state}; Path=/; HttpOnly; Max-Age=600")
            self.end_headers()
            return

        # OAuth callback
        if path == "/auth/callback":
            raw = self.headers.get("Cookie", "")
            c = SimpleCookie(); c.load(raw)
            saved_state = c.get("oauth_state", None)
            code  = qs.get("code", [None])[0]
            state = qs.get("state", [None])[0]
            error = qs.get("error", [None])[0]

            if error or not code:
                self.redirect("/?auth_error=1")
                return
            if not saved_state or saved_state.value != state:
                self.redirect("/?auth_error=2")
                return

            tokens = _auth.exchange_code(code, self.get_host())
            if not tokens or "access_token" not in tokens:
                self.redirect("/?auth_error=3")
                return

            info = _auth.get_user_info(tokens["access_token"])
            if not info or not info.get("email"):
                self.redirect("/?auth_error=4")
                return

            user = {
                "id":      info.get("sub", info.get("id", "")),
                "email":   info["email"],
                "name":    info.get("name", info["email"]),
                "picture": info.get("picture", ""),
            }
            # Upsert user in DB
            _db.upsert_one("users", {"id": user["id"]}, {**user, "last_login": int(time.time())})
            cookie = _auth.create_session_cookie(user)
            self.set_session_cookie(cookie)
            return

        # Logout
        if path == "/auth/logout":
            self.clear_session_cookie()
            return

        # ── API endpoints ────────────────────────────────────────────────────

        # Resort data
        if path == "/api/resort/slopes":
            slopes = _load_slopes()
            self.json_ok(slopes)
            return

        if path == "/api/resort/lifts":
            lifts = _load_lifts()
            self.json_ok(lifts)
            return

        if path == "/api/resort/pois":
            pois = _load_pois()
            self.json_ok(pois)
            return

        if path == "/api/resort/all":
            sector = qs.get("sector", [None])[0]
            slopes = _load_slopes()
            lifts  = _load_lifts()
            pois   = _load_pois()
            if sector:
                slopes = [s for s in slopes if s.get("sector") == sector]
                lifts  = [l for l in lifts  if l.get("sector") == sector]
                pois   = [p for p in pois   if p.get("sector") == sector]
            self.json_ok({"slopes": slopes, "lifts": lifts, "pois": pois})
            return

        # Seed endpoint (protected by SEED_SECRET env var or any-auth fallback)
        if path == "/api/seed":
            user = self.get_session()
            seed_secret = os.environ.get("SEED_SECRET", "")
            provided = qs.get("secret", [""])[0]
            if not user and not (seed_secret and provided == seed_secret):
                self.error(401, "Unauthorized — login or provide ?secret=SEED_SECRET")
                return
            force = qs.get("force", ["0"])[0] == "1"
            result = _run_seed(force=force)
            self.json_ok(result)
            return

        # Weather (proxy to Open-Meteo with 30-min cache)
        if path == "/api/weather":
            self.json_ok(_get_weather())
            return

        # Sessions list
        if path == "/api/sessions":
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            sessions = _db.find_many("sessions", {"user_id": user["id"]})
            # Sort by start_time descending
            sessions.sort(key=lambda s: s.get("start_time", 0), reverse=True)
            self.json_ok(sessions[:50])
            return

        # Single session
        m = re.match(r"^/api/sessions/([a-zA-Z0-9_-]+)$", path)
        if m:
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            sess = _db.find_one("sessions", {"id": m.group(1), "user_id": user["id"]})
            if not sess:
                self.error(404, "Not found")
                return
            self.json_ok(sess)
            return

        # Season stats
        if path == "/api/stats/season":
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            stats = _compute_season_stats(user["id"])
            self.json_ok(stats)
            return

        # User profile (info + preferences)
        if path == "/api/user/profile":
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            prefs = _db.get_user_preferences(user["id"])
            self.json_ok({
                "id":      user["id"],
                "name":    user.get("name", ""),
                "email":   user.get("email", ""),
                "picture": user.get("picture", ""),
                "preferences": prefs,
            })
            return

        # User stats (season aggregation)
        if path == "/api/user/stats":
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            s = _compute_season_stats(user["id"])
            self.json_ok({
                "total_days":        s.get("days", 0),
                "total_distance_km": round(s.get("distance_m", 0) / 1000, 1),
                "total_vertical_m":  s.get("total_vertical_m", 0),
                "total_runs":        s.get("runs", 0),
                "max_speed_kmh":     s.get("max_speed_kmh", 0),
            })
            return

        # Admin — update slope status
        m = re.match(r"^/api/admin/slopes/([a-z0-9]+)/status$", path)
        if m:
            user = self.get_session()
            if not user:
                self.error(401, "Unauthorized")
                return
            # Only for authenticated users (extend with admin role later)
            slope_id = m.group(1)
            status   = qs.get("status", ["open"])[0]
            _update_slope_status(slope_id, status)
            self.json_ok({"ok": True})
            return

        # SPA — all other routes
        self.serve_app()

    # ────────────────────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        user   = self.get_session()

        if path == "/api/sessions":
            if not user:
                self.error(401, "Unauthorized")
                return
            data = self.read_json()
            sess_id = str(uuid.uuid4())
            gps_trail = data.get("gps_trail", [])
            stats = _compute_session_stats(gps_trail, data.get("slopes_skied", []))
            session = {
                "id":          sess_id,
                "user_id":     user["id"],
                "date":        data.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
                "start_time":  data.get("start_time", int(time.time())),
                "end_time":    data.get("end_time",   int(time.time())),
                "gps_trail":   gps_trail,
                "slopes_skied": data.get("slopes_skied", []),
                "stats":       stats,
            }
            _db.insert_one("sessions", session)
            self.json_ok({"id": sess_id, "stats": stats})
            return

        if path == "/api/sessions/gps":
            # Append GPS points to an in-progress session (not persisted until /api/sessions POST)
            self.json_ok({"ok": True})
            return

        # Admin slope status update via POST
        m = re.match(r"^/api/admin/slopes/([a-z0-9]+)/status$", path)
        if m:
            if not user:
                self.error(401, "Unauthorized")
                return
            data = self.read_json()
            _update_slope_status(m.group(1), data.get("status", "open"))
            self.json_ok({"ok": True})
            return

        self.error(404, "Not found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        user   = self.get_session()

        if path == "/api/user/preferences":
            if not user:
                self.error(401, "Unauthorized")
                return
            prefs = self.read_json()
            _db.save_user_preferences(user["id"], prefs)
            self.json_ok({"ok": True})
            return

        self.error(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        user   = self.get_session()

        m = re.match(r"^/api/sessions/([a-zA-Z0-9_-]+)$", path)
        if m:
            if not user:
                self.error(401, "Unauthorized")
                return
            _db.delete_one("sessions", {"id": m.group(1), "user_id": user["id"]})
            self.json_ok({"ok": True})
            return

        if path == "/api/user/data":
            if not user:
                self.error(401, "Unauthorized")
                return
            _db.delete_user_data(user["id"])
            self.json_ok({"ok": True, "message": "All data deleted"})
            return

        self.error(404, "Not found")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, PUT, DELETE, OPTIONS")
        self.end_headers()


# ── Weather cache ─────────────────────────────────────────────────────────────
_weather_cache     = None
_weather_cache_ts  = 0
_WEATHER_TTL       = 30 * 60  # 30 minutes

def _get_weather():
    global _weather_cache, _weather_cache_ts
    now = time.time()
    if _weather_cache and (now - _weather_cache_ts) < _WEATHER_TTL:
        age = int(now - _weather_cache_ts)
        return {**_weather_cache, "_cached_age_s": age}
    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=47.1692&longitude=11.8651"
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature"
            ",weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
            "&hourly=temperature_2m,weather_code,wind_speed_10m,snowfall"
            "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset"
            ",snowfall_sum,weather_code"
            "&timezone=Europe%2FVienna&forecast_days=3"
        )
        import urllib.request as _ur
        req = _ur.Request(url, headers={"User-Agent": "MayrhofenTracker/1.0 (ski tracking app)"})
        with _ur.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        data["_fetched_at"] = int(now)
        data["_cached_age_s"] = 0
        _weather_cache    = data
        _weather_cache_ts = now
        print(f"[weather] fetched fresh data at {datetime.utcnow().isoformat()}")
        return data
    except Exception as e:
        print(f"[weather] fetch error: {e}")
        if _weather_cache:
            age = int(now - _weather_cache_ts)
            return {**_weather_cache, "_cached_age_s": age, "_stale": True}
        return {"error": str(e)}

# ── Seed ─────────────────────────────────────────────────────────────────────
def _run_seed(force=False):
    result = {}
    for col, fname in [("slopes","slopes.json"),("lifts","lifts.json"),("pois","pois.json")]:
        try:
            data = _load_json_file(fname)
            if force and _db.db is not None:
                _db.db[col].drop()
            existing = _db.find_many(col)
            if existing and not force:
                result[col] = f"skipped ({len(existing)} already)"
                continue
            for doc in data:
                _db.insert_one(col, doc)
            result[col] = f"seeded {len(data)} docs"
        except Exception as e:
            result[col] = f"error: {e}"
    return result

# ── Resort data loaders ──────────────────────────────────────────────────────
def _load_json_file(name):
    path = os.path.join(STATIC_DIR, "data", name)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _load_slopes():
    try:
        docs = _db.find_many("slopes")
        if docs:
            return docs
    except Exception:
        pass
    return _load_json_file("slopes.json")

def _load_lifts():
    try:
        docs = _db.find_many("lifts")
        if docs:
            return docs
    except Exception:
        pass
    return _load_json_file("lifts.json")

def _load_pois():
    try:
        docs = _db.find_many("pois")
        if docs:
            return docs
    except Exception:
        pass
    return _load_json_file("pois.json")

def _update_slope_status(slope_id, status):
    slopes = _load_slopes()
    for s in slopes:
        if s["id"] == slope_id:
            s["status"] = status
            _db.upsert_one("slopes", {"id": slope_id}, s)
            return


# ── Stats computation ────────────────────────────────────────────────────────
def _haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def _compute_session_stats(gps_trail, slopes_skied):
    if not gps_trail:
        return {
            "time_on_slopes_s": 0,
            "distance_m": 0,
            "runs": len(set(s.get("slope_id") for s in slopes_skied)) if slopes_skied else 0,
            "max_altitude_m": 0,
            "total_vertical_m": 0,
            "max_speed_kmh": 0,
            "avg_speed_kmh": 0,
        }

    total_dist = 0.0
    max_alt    = 0.0
    total_vert = 0.0
    max_speed  = 0.0
    speeds     = []
    skiing_time = 0

    for i in range(1, len(gps_trail)):
        p0 = gps_trail[i-1]
        p1 = gps_trail[i]
        lat0, lng0 = p0.get("lat", 0), p0.get("lng", 0)
        lat1, lng1 = p1.get("lat", 0), p1.get("lng", 0)
        alt0 = p0.get("altitude", 0) or 0
        alt1 = p1.get("altitude", 0) or 0
        t0   = p0.get("ts", 0)
        t1   = p1.get("ts", 0)

        dist = _haversine(lat0, lng0, lat1, lng1)
        total_dist += dist

        alt_diff = alt0 - alt1
        if alt_diff > 0:
            total_vert += alt_diff

        max_alt = max(max_alt, alt0, alt1)

        dt = (t1 - t0) / 1000.0  # seconds
        if dt > 0:
            spd = (dist / dt) * 3.6  # km/h
            if spd < 150:  # ignore GPS noise spikes
                speeds.append(spd)
                max_speed = max(max_speed, spd)
                # Count skiing time when going downhill faster than 3 km/h
                if spd > 3 and alt_diff > 0:
                    skiing_time += dt

    avg_speed = (sum(speeds) / len(speeds)) if speeds else 0

    return {
        "time_on_slopes_s": int(skiing_time),
        "distance_m":       int(total_dist),
        "runs":             len(set(s.get("slope_id","") for s in slopes_skied)) if slopes_skied else 0,
        "max_altitude_m":   int(max_alt),
        "total_vertical_m": int(total_vert),
        "max_speed_kmh":    round(max_speed, 1),
        "avg_speed_kmh":    round(avg_speed, 1),
    }

def _compute_season_stats(user_id):
    sessions = _db.find_many("sessions", {"user_id": user_id})
    total = {
        "days": len(sessions),
        "distance_m": 0,
        "total_vertical_m": 0,
        "time_on_slopes_s": 0,
        "runs": 0,
        "max_speed_kmh": 0,
        "max_altitude_m": 0,
    }
    for s in sessions:
        st = s.get("stats", {})
        total["distance_m"]       += st.get("distance_m", 0)
        total["total_vertical_m"] += st.get("total_vertical_m", 0)
        total["time_on_slopes_s"] += st.get("time_on_slopes_s", 0)
        total["runs"]             += st.get("runs", 0)
        total["max_speed_kmh"]     = max(total["max_speed_kmh"], st.get("max_speed_kmh", 0))
        total["max_altitude_m"]    = max(total["max_altitude_m"], st.get("max_altitude_m", 0))
    return total


# ── Startup ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    _db.init_db()
    print(f"[server] Starting MayrhofenTracker on port {PORT}")
    server = ThreadingHTTPServer(("", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[server] Stopped")
