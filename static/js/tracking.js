/* ── MayrhofenTracker — GPS tracking ─────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────────────────────
let _tracking = false;
let _watchId  = null;
let _sessionStart = null;
let _gpsTrail = [];        // raw GPS points
let _slopesSkied = [];     // detected slope runs
let _durationTimer = null;
let _lastPos = null;
let _totalDist = 0;
let _totalVert = 0;
let _maxSpeed  = 0;
let _maxAlt    = 0;
let _speedSamples = [];

const SLOPE_PROXIMITY_M = 120;  // meters to consider "on a slope"

// Current session export
window._currentSession = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-start-stop');
  if (btn) btn.addEventListener('click', toggleTracking);

  const fabBtn = document.getElementById('btn-quick-track');
  if (fabBtn) {
    // Already handled in app.js to switch tab — also trigger tracking if already on tracking tab
    fabBtn.addEventListener('click', () => {
      if (state.activeTab === 'tracking') toggleTracking();
    });
  }
});

// ── Toggle ────────────────────────────────────────────────────────────────────
function toggleTracking() {
  if (_tracking) {
    _stopTracking();
  } else {
    _startTracking();
  }
}

function _startTracking() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported on this device.');
    return;
  }

  _tracking     = true;
  _sessionStart = Date.now();
  _gpsTrail     = [];
  _slopesSkied  = [];
  _totalDist    = 0;
  _totalVert    = 0;
  _maxSpeed     = 0;
  _maxAlt       = 0;
  _speedSamples = [];
  _lastPos      = null;

  // UI
  const btn = document.getElementById('btn-start-stop');
  if (btn) {
    btn.classList.remove('start');
    btn.classList.add('stop');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
      <path d="M6 6h12v12H6z"/>
    </svg><span>Stop Tracking</span>`;
  }
  _setText('track-state-label', 'Recording...');

  const fab = document.getElementById('btn-quick-track');
  if (fab) fab.classList.add('recording');

  // Duration timer
  _durationTimer = setInterval(_updateDuration, 1000);

  // GPS watch
  _watchId = navigator.geolocation.watchPosition(
    _onGPS,
    _onGPSError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
  );
}

function _stopTracking() {
  _tracking = false;

  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_durationTimer) {
    clearInterval(_durationTimer);
    _durationTimer = null;
  }

  // UI
  const btn = document.getElementById('btn-start-stop');
  if (btn) {
    btn.classList.remove('stop');
    btn.classList.add('start');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg><span>Start Tracking</span>`;
  }
  _setText('track-state-label', 'Saving session...');

  const fab = document.getElementById('btn-quick-track');
  if (fab) fab.classList.remove('recording');

  _saveSession();
}

// ── GPS handler ───────────────────────────────────────────────────────────────
function _onGPS(pos) {
  const { latitude, longitude, altitude, speed, heading } = pos.coords;
  const ts = pos.timestamp;
  const alt = altitude || 0;
  const spd = speed ? speed * 3.6 : 0;  // m/s → km/h

  const point = { lat: latitude, lng: longitude, altitude: alt, speed: spd, ts };
  _gpsTrail.push(point);

  // Update map
  window.updateMapGPS && window.updateMapGPS(latitude, longitude, heading);
  window.addTrailPoint && window.addTrailPoint(latitude, longitude);

  // Compute incremental stats
  if (_lastPos) {
    const dist = window._haversine(
      _lastPos.lat, _lastPos.lng, latitude, longitude
    );
    const dt = (ts - _lastPos.ts) / 1000;
    if (dt > 0) {
      _totalDist += dist;
      const altDrop = (_lastPos.altitude || 0) - alt;
      if (altDrop > 0) _totalVert += altDrop;

      const calcSpeed = (dist / dt) * 3.6;
      const usedSpeed = spd || (calcSpeed < 150 ? calcSpeed : 0);
      if (usedSpeed > 0 && usedSpeed < 150) {
        _speedSamples.push(usedSpeed);
        _maxSpeed = Math.max(_maxSpeed, usedSpeed);
      }
    }
  }
  _maxAlt = Math.max(_maxAlt, alt);
  _lastPos = point;

  // Detect which slope we're on
  _detectSlope(latitude, longitude, spd);

  // Update UI
  _updateLiveStats(spd, alt);
}

function _onGPSError(err) {
  console.warn('[tracking] GPS error:', err.code, err.message);
  _setText('track-state-label', `GPS error: ${err.message}`);
}

// ── Live stats UI ─────────────────────────────────────────────────────────────
function _updateLiveStats(spd, alt) {
  _setText('live-speed',    spd ? spd.toFixed(1) : '0.0');
  _setText('live-altitude', alt ? Math.round(alt) : '—');
  _setText('live-distance', (_totalDist / 1000).toFixed(2));
  _setText('live-vertical', Math.round(_totalVert));
  _setText('live-runs',     new Set(_slopesSkied.map(s => s.slope_id + '_' + s.run_n)).size);

  // Also update stats tab live
  const avgSpeed = _speedSamples.length
    ? _speedSamples.reduce((a, b) => a + b, 0) / _speedSamples.length
    : 0;

  window._renderStatsCard && window._renderStatsCard({
    time_on_slopes_s: Math.round((Date.now() - _sessionStart) / 1000),
    distance_m:       Math.round(_totalDist),
    runs:             new Set(_slopesSkied.map(s => s.slope_id)).size,
    max_altitude_m:   Math.round(_maxAlt),
    total_vertical_m: Math.round(_totalVert),
    max_speed_kmh:    Math.round(_maxSpeed * 10) / 10,
    avg_speed_kmh:    Math.round(avgSpeed * 10) / 10,
  });
}

function _updateDuration() {
  if (!_sessionStart) return;
  const secs = Math.round((Date.now() - _sessionStart) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  _setText('live-duration', `${m}:${String(s).padStart(2, '0')}`);
}

// ── Slope detection ───────────────────────────────────────────────────────────
let _currentSlopeId = null;
let _runCounter = {};

function _detectSlope(lat, lng, speed) {
  if (!state.slopes || !state.slopes.length) return;

  let nearest = null;
  let nearestDist = Infinity;

  state.slopes.forEach(slope => {
    if (!slope.coordinates) return;
    // Check distance to each segment of the slope polyline
    const d = _distToPolyline(lat, lng, slope.coordinates);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = slope;
    }
  });

  if (nearest && nearestDist < SLOPE_PROXIMITY_M) {
    if (_currentSlopeId !== nearest.id) {
      // Entered a new slope
      _currentSlopeId = nearest.id;
      if (!_runCounter[nearest.id]) _runCounter[nearest.id] = 0;
      _runCounter[nearest.id]++;

      const run = {
        slope_id:   nearest.id,
        slope_name: nearest.name,
        difficulty: nearest.difficulty,
        sector:     nearest.sector,
        run_n:      _runCounter[nearest.id],
        ts:         Date.now(),
      };
      _slopesSkied.push(run);

      // Update detected slopes UI
      _renderDetectedSlopes();
    }
  } else {
    _currentSlopeId = null;
  }
}

function _distToPolyline(lat, lng, coords) {
  let minDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = _distToSegment(lat, lng, coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function _distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return window._haversine(px, py, ax, ay);
  let t = ((px - ax)*dx + (py - ay)*dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return window._haversine(px, py, ax + t*dx, ay + t*dy);
}

function _renderDetectedSlopes() {
  const el = document.getElementById('detected-slopes-list');
  if (!el) return;

  // Count runs per slope
  const counts = {};
  _slopesSkied.forEach(s => {
    const key = s.slope_id;
    if (!counts[key]) counts[key] = { ...s, count: 0 };
    counts[key].count++;
  });

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
  if (!sorted.length) {
    el.innerHTML = '<p class="muted">No slopes detected yet.</p>';
    return;
  }

  el.innerHTML = sorted.map(s => `
    <div class="slope-detected-item">
      <span class="slope-diff-dot ${s.difficulty}"></span>
      <span style="flex:1;font-size:0.88rem">${s.slope_name}</span>
      <span class="slope-count">x${s.count}</span>
    </div>
  `).join('');

  // Also update stats tab
  window._renderIdentifiedSlopes && window._renderIdentifiedSlopes(_slopesSkied);
}

// ── Save session ──────────────────────────────────────────────────────────────
async function _saveSession() {
  const endTime = Date.now();
  const payload = {
    date:         new Date(_sessionStart).toISOString().slice(0, 10),
    start_time:   Math.floor(_sessionStart / 1000),
    end_time:     Math.floor(endTime / 1000),
    gps_trail:    _gpsTrail,
    slopes_skied: _slopesSkied,
  };

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    window._currentSession = { ...payload, stats: data.stats, id: data.id };
    _setText('track-state-label', 'Session saved!');

    // Update stats tab
    window._renderStatsCard && window._renderStatsCard(data.stats);
    window._renderIdentifiedSlopes && window._renderIdentifiedSlopes(_slopesSkied);
    window._renderBadges && window._renderBadges(data.stats, _slopesSkied);
    window._loadSessionHistory && window._loadSessionHistory();

    // Reset UI after 2s
    setTimeout(() => _setText('track-state-label', 'Ready'), 2000);
  } catch (e) {
    console.error('[tracking] save session error:', e);
    _setText('track-state-label', 'Save failed — check connection');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
