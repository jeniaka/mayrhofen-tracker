import os
import hmac
import hashlib
import base64
import json
import time
import secrets
import urllib.parse
import urllib.request

GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SESSION_SECRET       = os.environ.get("SESSION_SECRET", "") or secrets.token_hex(32)

if not os.environ.get("SESSION_SECRET"):
    print("WARNING: SESSION_SECRET not set — sessions lost on restart")

SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

def get_redirect_uri(host):
    scheme = "https" if "onrender.com" in host or "." in host.split(":")[0] else "http"
    return f"{scheme}://{host}/auth/callback"

def build_auth_url(host, state=None):
    redirect_uri = get_redirect_uri(host)
    if not state:
        state = secrets.token_urlsafe(16)
    params = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    })
    return f"https://accounts.google.com/o/oauth2/v2/auth?{params}", state

def exchange_code(code, host):
    redirect_uri = get_redirect_uri(host)
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[auth] token exchange error: {e}")
        return None

def get_user_info(access_token):
    req = urllib.request.Request(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[auth] userinfo error: {e}")
        return None

def _sign(payload_b64):
    return hmac.new(SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()

def create_session_cookie(user):
    payload = {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture", ""),
        "exp": int(time.time()) + SESSION_MAX_AGE,
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"

def verify_session_cookie(cookie_val):
    try:
        payload_b64, sig = cookie_val.rsplit(".", 1)
        expected = _sign(payload_b64)
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
