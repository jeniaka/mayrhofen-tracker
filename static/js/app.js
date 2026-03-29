/* ── MayrhofenTracker — main app shell ──────────────────────────────────────── */

// ── Global state ──────────────────────────────────────────────────────────────
window.__STATE__ = {
  lang:        localStorage.getItem('mt_lang') || 'en',
  units:       localStorage.getItem('mt_units') || 'metric',
  activeTab:   'map',
  slopes:      [],
  lifts:       [],
  pois:        [],
  resortLoaded: false,
};

const state = window.__STATE__;

// ── URL routing ───────────────────────────────────────────────────────────────
const ROUTE_TO_TAB = {
  '/home':    'home',
  '/map':     'map',
  '/track':   'tracking',
  '/stats':   'stats',
  '/profile': 'profile',
};
const TAB_TO_ROUTE = {
  home:     '/home',
  map:      '/map',
  tracking: '/track',
  stats:    '/stats',
  profile:  '/profile',
};

function navigateTo(route) {
  const tab = ROUTE_TO_TAB[route] || 'map';
  window.history.pushState({ tab }, '', route);
  switchTab(tab);
}

window.addEventListener('popstate', e => {
  const tab = (e.state && e.state.tab) || ROUTE_TO_TAB[window.location.pathname] || 'map';
  switchTab(tab);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!window.__LOGGED_IN__) {
    document.getElementById('login-screen').style.display = 'flex';
    return;
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  _initProfile();
  _initNav();
  _loadResortData();
  _initSettings();
  _renderTours();
  _loadWeather();
  _initWebcams && _initWebcams();
  _loadSessionHistory();
  _loadSeasonStats();

  // Set initial tab from URL
  const initTab = ROUTE_TO_TAB[window.location.pathname] || 'map';
  window.history.replaceState({ tab: initTab }, '', TAB_TO_ROUTE[initTab] || '/map');
  switchTab(initTab);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[sw]', e));
  }
});

// ── Profile ───────────────────────────────────────────────────────────────────
function _initProfile() {
  const u = window.__USER__;
  if (!u) return;
  document.getElementById('profile-name').textContent  = u.name || u.email;
  document.getElementById('profile-email').textContent = u.email || '';
  const pic = document.getElementById('profile-pic');
  if (u.picture) {
    pic.src = u.picture;
  } else {
    pic.style.display = 'none';
  }

  // Greet
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent =
    `${greet}, ${(u.name || u.email).split(' ')[0]}! Ready to shred?`;
}

// ── Bottom nav tabs ───────────────────────────────────────────────────────────
function _initNav() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = TAB_TO_ROUTE[btn.dataset.tab] || '/map';
      navigateTo(route);
    });
  });

  document.getElementById('btn-quick-track').addEventListener('click', () => {
    navigateTo('/track');
  });
}

function switchTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

  const el = document.getElementById(`tab-${tab}`);
  if (el) el.classList.add('active');

  const btn = document.querySelector(`.nav-tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  // Lazy init
  if (tab === 'map' && !state.mapInitialized) {
    window.initMap && window.initMap();
  }
  if (tab === 'stats') {
    _refreshStats();
  }
  if (tab === 'profile') {
    _loadSeasonStats();
  }
}

// ── Resort data ───────────────────────────────────────────────────────────────
async function _loadResortData() {
  try {
    const res = await fetch('/api/resort/all');
    const data = await res.json();
    state.slopes = data.slopes || [];
    state.lifts  = data.lifts  || [];
    state.pois   = data.pois   || [];
    state.resortLoaded = true;

    _updateResortStatus();

    // Init map now that data is ready
    if (state.activeTab === 'map' || !state.mapInitialized) {
      window.initMap && window.initMap();
    }
  } catch (e) {
    console.error('[app] loadResortData', e);
  }
}

function _updateResortStatus() {
  const openCount   = state.slopes.filter(s => s.status === 'open').length;
  const liftCount   = state.lifts.filter(l => l.status === 'open').length;
  const openEl  = document.getElementById('open-count');
  const liftEl  = document.getElementById('lift-count');
  if (openEl) openEl.textContent = openCount;
  if (liftEl) liftEl.textContent = liftCount;
}

// ── Suggested tours ───────────────────────────────────────────────────────────
const TOURS = [
  { id: 's', badge: 'S', label: 'S Tour', desc: 'Easy blue pistes only — perfect for beginners' },
  { id: 'm', badge: 'M', label: 'M Tour', desc: 'Moderate mix of blue and red runs' },
  { id: 'xxl', badge: 'XXL', label: 'XXL Circuit', desc: 'Horberg + Penken + Rastkogel + Eggalm safari' },
  { id: 'alt', badge: 'ALT', label: 'Altitude Guzzler', desc: '13,000m+ vertical — certificate at the end!' },
  { id: 'fun', badge: 'FUN', label: 'Fun + Action', desc: 'Ski Movie Run + Harakiri black slope' },
];

function _renderTours() {
  const el = document.getElementById('tours-list');
  if (!el) return;
  el.innerHTML = TOURS.map(tour => `
    <div class="tour-item" data-tour="${tour.id}">
      <div class="tour-badge ${tour.id}">${tour.badge}</div>
      <div>
        <div class="tour-name">${tour.label}</div>
        <div class="tour-desc">${tour.desc}</div>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.tour-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo('/map');
      window.highlightTour && window.highlightTour(item.dataset.tour);
    });
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
function _initSettings() {
  const langSel  = document.getElementById('lang-select');
  const unitsSel = document.getElementById('units-select');
  if (langSel) {
    langSel.value = state.lang;
    langSel.addEventListener('change', () => {
      state.lang = langSel.value;
      localStorage.setItem('mt_lang', state.lang);
      document.documentElement.setAttribute('lang', state.lang);
    });
  }
  if (unitsSel) {
    unitsSel.value = state.units;
    unitsSel.addEventListener('change', () => {
      state.units = unitsSel.value;
      localStorage.setItem('mt_units', state.units);
    });
  }
}

// ── Stats refresh ─────────────────────────────────────────────────────────────
function _refreshStats() {
  const sess = window._currentSession;
  if (!sess || !sess.stats) {
    // Show zeros / blank
    _renderStatsCard({});
    return;
  }
  _renderStatsCard(sess.stats);
  _renderIdentifiedSlopes(sess.slopes_skied || []);
  _renderBadges(sess.stats, sess.slopes_skied || []);
}

function _renderStatsCard(stats) {
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  _setText('stat-time',     fmt(stats.time_on_slopes_s || 0));
  _setText('stat-dist',     ((stats.distance_m || 0) / 1000).toFixed(1) + ' km');
  _setText('stat-runs',     stats.runs || 0);
  _setText('stat-maxalt',   stats.max_altitude_m ? stats.max_altitude_m + ' m' : '— m');
  _setText('stat-vert',     (stats.total_vertical_m || 0) + ' m');
  _setText('stat-maxspeed', (stats.max_speed_kmh || 0) + ' km/h');
  _setText('stat-avgspeed', (stats.avg_speed_kmh || 0) + ' km/h');
}

function _renderIdentifiedSlopes(slopesSkied) {
  const el = document.getElementById('slopes-list');
  const barEl = document.getElementById('slopes-summary-bar');
  if (!el) return;

  if (!slopesSkied || !slopesSkied.length) {
    el.innerHTML = '<p class="muted">No slopes identified yet.</p>';
    if (barEl) barEl.innerHTML = '';
    return;
  }

  // Count by slope
  const counts = {};
  slopesSkied.forEach(s => {
    const id = s.slope_id;
    counts[id] = (counts[id] || { ...s, count: 0 });
    counts[id].count++;
  });

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);

  // Summary bar
  const blue   = sorted.filter(s => s.difficulty === 'blue').reduce((n, s) => n + s.count, 0);
  const red    = sorted.filter(s => s.difficulty === 'red').reduce((n, s) => n + s.count, 0);
  const black  = sorted.filter(s => s.difficulty === 'black').reduce((n, s) => n + s.count, 0);
  const total  = blue + red + black || 1;

  if (barEl) {
    barEl.innerHTML = `
      <div class="slopes-summary">
        <span class="slopes-count-label" style="color:var(--blue)">${blue} blue</span>
        <span class="slopes-count-label" style="color:var(--red)">${red} red</span>
        <span class="slopes-count-label" style="color:var(--black-slope)">${black} black</span>
        <div class="slopes-bar">
          <div class="slopes-bar-seg" style="width:${(blue/total*100).toFixed(0)}%;background:var(--blue)"></div>
          <div class="slopes-bar-seg" style="width:${(red/total*100).toFixed(0)}%;background:var(--red)"></div>
          <div class="slopes-bar-seg" style="width:${(black/total*100).toFixed(0)}%;background:var(--black-slope)"></div>
        </div>
      </div>`;
  }

  el.innerHTML = sorted.map(s => `
    <div class="slope-item">
      <span class="slope-icon">⛷</span>
      <span class="slope-diff-dot ${s.difficulty}"></span>
      <span class="slope-name">${s.slope_name || s.slope_id}</span>
      <span class="slope-x-count">x${s.count}</span>
    </div>
  `).join('');
}

// ── Badges ────────────────────────────────────────────────────────────────────
const BADGES = [
  { id: 'dist_10',   icon: '🎽', label: '10 km',       check: (st) => (st.distance_m||0) >= 10000 },
  { id: 'dist_50',   icon: '🏃', label: '50 km',       check: (st) => (st.distance_m||0) >= 50000 },
  { id: 'spd_50',    icon: '⚡', label: '50 km/h',     check: (st) => (st.max_speed_kmh||0) >= 50 },
  { id: 'spd_80',    icon: '🚀', label: '80 km/h',     check: (st) => (st.max_speed_kmh||0) >= 80 },
  { id: 'vert_1k',   icon: '⛰', label: '1,000 m ↓',  check: (st) => (st.total_vertical_m||0) >= 1000 },
  { id: 'vert_5k',   icon: '🏔', label: '5,000 m ↓',  check: (st) => (st.total_vertical_m||0) >= 5000 },
  { id: 'harakiri',  icon: '💀', label: 'Harakiri',   check: (st, sl) => sl.some(s => s.slope_id === 's34') },
  { id: 'early',     icon: '🌅', label: 'Early Bird', check: (st, sl, session) => { /* checked in tracking */ return false; } },
  { id: 'marathon',  icon: '🏅', label: 'Marathon',   check: (st) => (st.time_on_slopes_s||0) >= 18000 },
  { id: 'alt_13k',   icon: '🎯', label: '13k Vert',   check: (st) => (st.total_vertical_m||0) >= 13000 },
  { id: 'allblue',   icon: '💙', label: 'Blue Tour',  check: (st, sl) => false },
  { id: 'allblack',  icon: '🖤', label: 'All Black',  check: (st, sl) => false },
];

function _renderBadges(stats, slopesSkied) {
  const el = document.getElementById('badges-grid');
  if (!el) return;
  const earned = new Set(JSON.parse(localStorage.getItem('mt_badges') || '[]'));

  BADGES.forEach(badge => {
    if (badge.check(stats, slopesSkied)) {
      if (!earned.has(badge.id)) {
        earned.add(badge.id);
        _showBadgeNotification(badge);
      }
    }
  });
  localStorage.setItem('mt_badges', JSON.stringify([...earned]));

  el.innerHTML = BADGES.map(b => `
    <div class="badge-item">
      <div class="badge-icon ${earned.has(b.id) ? 'earned' : ''}">${b.icon}</div>
      <div class="badge-label">${b.label}</div>
    </div>
  `).join('');
}

function _showBadgeNotification(badge) {
  const div = document.createElement('div');
  div.className = 'badge-notification';
  div.innerHTML = `${badge.icon} Badge Earned: ${badge.label}`;
  document.body.appendChild(div);
  requestAnimationFrame(() => {
    div.classList.add('show');
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, 3000);
  });
}

// ── Session history ───────────────────────────────────────────────────────────
async function _loadSessionHistory() {
  const el = document.getElementById('sessions-list');
  if (!el) return;
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    const sessions = await res.json();
    if (!sessions.length) {
      el.innerHTML = '<p class="muted">No sessions yet.</p>';
      return;
    }
    el.innerHTML = sessions.slice(0, 10).map(s => `
      <div class="session-item" data-id="${s.id}">
        <div>
          <div class="session-date">${s.date || '—'}</div>
          <div class="session-meta">
            ${((s.stats?.distance_m||0)/1000).toFixed(1)} km •
            ${s.stats?.runs || 0} runs •
            ${s.stats?.max_speed_kmh || 0} km/h max
          </div>
        </div>
        <span class="session-arrow">›</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('[app] loadSessionHistory', e);
  }
}

// ── Season stats ──────────────────────────────────────────────────────────────
async function _loadSeasonStats() {
  const el = document.getElementById('season-stats-content');
  if (!el) return;
  try {
    const res = await fetch('/api/stats/season');
    if (!res.ok) return;
    const s = await res.json();
    el.innerHTML = `
      <div class="season-grid">
        <div class="season-stat">
          <div class="season-val">${s.days || 0}</div>
          <div class="season-lbl">Ski Days</div>
        </div>
        <div class="season-stat">
          <div class="season-val">${((s.distance_m||0)/1000).toFixed(0)} km</div>
          <div class="season-lbl">Total Distance</div>
        </div>
        <div class="season-stat">
          <div class="season-val">${((s.total_vertical_m||0)/1000).toFixed(1)} km</div>
          <div class="season-lbl">Total Vertical</div>
        </div>
        <div class="season-stat">
          <div class="season-val">${s.runs || 0}</div>
          <div class="season-lbl">Total Runs</div>
        </div>
        <div class="season-stat">
          <div class="season-val">${s.max_speed_kmh || 0}</div>
          <div class="season-lbl">Top Speed km/h</div>
        </div>
        <div class="season-stat">
          <div class="season-val">${s.max_altitude_m || 0} m</div>
          <div class="season-lbl">Max Altitude</div>
        </div>
      </div>`;
  } catch (e) {
    console.error('[app] loadSeasonStats', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const phi1 = lat1 * Math.PI/180, phi2 = lat2 * Math.PI/180;
  const dphi = (lat2-lat1) * Math.PI/180;
  const dlam = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Expose for tracking.js
window._haversine = _haversine;
window._renderIdentifiedSlopes = _renderIdentifiedSlopes;
window._renderStatsCard = _renderStatsCard;
window._renderBadges = _renderBadges;
window._loadSessionHistory = _loadSessionHistory;
