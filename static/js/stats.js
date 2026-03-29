/* ── MayrhofenTracker — stats ────────────────────────────────────────────────── */

// This module handles session detail view and replay

document.addEventListener('DOMContentLoaded', () => {
  // Session item click — show detail
  document.getElementById('sessions-list')?.addEventListener('click', e => {
    const item = e.target.closest('.session-item');
    if (item) _showSessionDetail(item.dataset.id);
  });
});

async function _showSessionDetail(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) return;
    const session = await res.json();
    _openSessionModal(session);
  } catch (e) {
    console.error('[stats] session detail:', e);
  }
}

function _openSessionModal(session) {
  // Remove existing modal
  document.querySelector('.modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const st = session.stats || {};
  const fmt = (s) => { const m = Math.floor(s/60); return `${m}:${String(s%60).padStart(2,'0')}`; };

  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Session — ${session.date || '—'}</div>

      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-block"><div class="stat-big">${fmt(st.time_on_slopes_s||0)}</div><div class="stat-desc">Time on slopes</div></div>
        <div class="stat-block"><div class="stat-big">${((st.distance_m||0)/1000).toFixed(1)} km</div><div class="stat-desc">Distance</div></div>
        <div class="stat-block"><div class="stat-big">${st.runs||0}</div><div class="stat-desc">Runs</div></div>
        <div class="stat-block"><div class="stat-big">${st.max_altitude_m||0} m</div><div class="stat-desc">Max altitude</div></div>
        <div class="stat-block"><div class="stat-big">${st.total_vertical_m||0} m</div><div class="stat-desc">Neg. elevation</div></div>
        <div class="stat-block"><div class="stat-big">${st.max_speed_kmh||0} km/h</div><div class="stat-desc">Max speed</div></div>
      </div>

      ${_renderSessionSlopesHtml(session.slopes_skied || [])}

      <div id="session-replay-map" style="height:200px;border-radius:8px;overflow:hidden;margin-top:12px"></div>
      <div class="replay-controls">
        <button class="replay-btn" id="btn-replay-play">▶ Replay</button>
        <div class="replay-speed">
          <button class="replay-btn" data-speed="1">1x</button>
          <button class="replay-btn active" data-speed="5">5x</button>
          <button class="replay-btn" data-speed="10">10x</button>
        </div>
      </div>
      <input type="range" class="scrubber" id="replay-scrubber" min="0" max="100" value="0">

      <button class="btn-logout" id="btn-delete-session" style="color:var(--red);margin-top:16px"
        data-id="${session.id}">Delete Session</button>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Speed buttons
  overlay.querySelectorAll('[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _replaySpeed = parseInt(btn.dataset.speed);
    });
  });

  // Delete
  overlay.querySelector('#btn-delete-session')?.addEventListener('click', async () => {
    if (!confirm('Delete this session?')) return;
    await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
    overlay.remove();
    window._loadSessionHistory && window._loadSessionHistory();
  });

  // Init replay map
  setTimeout(() => {
    _initReplayMap(session);
    overlay.querySelector('#btn-replay-play')?.addEventListener('click', () => {
      _startReplay(session);
    });
  }, 100);
}

function _renderSessionSlopesHtml(slopesSkied) {
  if (!slopesSkied.length) return '';
  const counts = {};
  slopesSkied.forEach(s => {
    if (!counts[s.slope_id]) counts[s.slope_id] = { ...s, count: 0 };
    counts[s.slope_id].count++;
  });
  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
  return `<div style="margin-top:12px">
    <div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:0.85rem;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Slopes Skied</div>
    ${sorted.map(s => `
      <div class="slope-item">
        <span class="slope-diff-dot ${s.difficulty}"></span>
        <span class="slope-name">${s.slope_name || s.slope_id}</span>
        <span class="slope-x-count">x${s.count}</span>
      </div>`).join('')}
  </div>`;
}

// ── Replay ────────────────────────────────────────────────────────────────────
let _replayMap    = null;
let _replayMarker = null;
let _replaySpeed  = 5;
let _replayTimer  = null;

function _initReplayMap(session) {
  const el = document.getElementById('session-replay-map');
  if (!el) return;

  _replayMap = L.map('session-replay-map', {
    center: [47.1692, 11.8651],
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
  });

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    opacity: 0.7,
  }).addTo(_replayMap);

  // Draw trail
  const trail = session.gps_trail || [];
  if (trail.length > 1) {
    const latlngs = trail.map(p => [p.lat, p.lng]);
    L.polyline(latlngs, { color: '#FF9800', weight: 2.5, opacity: 0.85 }).addTo(_replayMap);
    const bounds = L.latLngBounds(latlngs);
    _replayMap.fitBounds(bounds.pad(0.1));
  }
}

function _startReplay(session) {
  const trail = session.gps_trail || [];
  if (!trail.length || !_replayMap) return;

  if (_replayTimer) {
    clearInterval(_replayTimer);
    _replayMarker && _replayMap.removeLayer(_replayMarker);
    _replayMarker = null;
  }

  const scrubber = document.getElementById('replay-scrubber');
  let idx = 0;

  const icon = L.divIcon({
    className: '',
    html: `<div class="gps-dot"><div class="gps-dot-inner"></div></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  _replayMarker = L.marker([trail[0].lat, trail[0].lng], { icon }).addTo(_replayMap);

  const interval = Math.max(50, Math.floor(1000 / _replaySpeed));

  _replayTimer = setInterval(() => {
    if (idx >= trail.length) {
      clearInterval(_replayTimer);
      return;
    }
    const p = trail[idx];
    _replayMarker.setLatLng([p.lat, p.lng]);
    _replayMap.panTo([p.lat, p.lng]);
    if (scrubber) scrubber.value = Math.round((idx / trail.length) * 100);
    idx++;
  }, interval);
}
