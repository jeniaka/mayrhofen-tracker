/* ── MayrhofenTracker — Leaflet map ──────────────────────────────────────────── */

let _map = null;
let _gpsMarker = null;
let _trailLayer = null;
let _autoPan = true;
let _miniMap = null;

const RESORT_BOUNDS = [[47.12, 11.80], [47.20, 11.92]];
const RESORT_CENTER = [47.1692, 11.8651];
const RESORT_ZOOM   = 13;

// Difficulty colors
const DIFF_COLOR = { blue: '#2196F3', red: '#F44336', black: '#90A4AE' };

window.initMap = function() {
  if (_map) return;
  const el = document.getElementById('map');
  if (!el) return;

  _map = L.map('map', {
    center: RESORT_CENTER,
    zoom:   RESORT_ZOOM,
    zoomControl: false,
    maxBounds: [[47.08, 11.75], [47.24, 11.98]],
    maxBoundsViscosity: 0.85,
    attributionControl: false,
  });

  // Base tile layer — OpenTopoMap for terrain feel
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenTopoMap',
    opacity: 0.9,
  }).addTo(_map);

  // Attribution (small)
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(_map);

  // Zoom controls (top-right)
  L.control.zoom({ position: 'topright' }).addTo(_map);

  state.mapInitialized = true;

  // Draw data when ready
  if (state.resortLoaded) {
    _drawSlopes();
    _drawLifts();
    _drawPOIs();
  } else {
    const wait = setInterval(() => {
      if (state.resortLoaded) {
        clearInterval(wait);
        _drawSlopes();
        _drawLifts();
        _drawPOIs();
      }
    }, 200);
  }

  // Controls
  document.getElementById('btn-locate').addEventListener('click', _locateMe);
  document.getElementById('btn-autopan').addEventListener('click', _toggleAutoPan);

  // Init mini map for tracking tab
  _initMiniMap();
};

// ── Draw slopes ───────────────────────────────────────────────────────────────
function _drawSlopes() {
  if (!_map) return;
  state.slopes.forEach(slope => {
    if (!slope.coordinates || slope.coordinates.length < 2) return;
    const color = DIFF_COLOR[slope.difficulty] || '#888';
    const line = L.polyline(slope.coordinates, {
      color,
      weight: slope.difficulty === 'black' ? 3.5 : 3,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(_map);

    line.bindPopup(_slopePopup(slope));
    line.on('click', () => line.openPopup());
  });
}

function _slopePopup(slope) {
  const statusDot = slope.status === 'open' ? 'open' : slope.status === 'groomed' ? 'groomed' : 'closed';
  return `<div class="popup-title">Piste ${slope.number}: ${slope.name}</div>
    <span class="popup-diff ${slope.difficulty}">${slope.difficulty.toUpperCase()}</span>
    <div class="popup-meta">
      ${slope.length_m ? `<strong>${(slope.length_m/1000).toFixed(1)} km</strong>` : ''}
      ${slope.elevation_drop_m ? ` &nbsp;&#x25BE; ${slope.elevation_drop_m}m` : ''}
      <br>Sector: ${slope.sector}
    </div>
    <div class="popup-status">
      <span class="popup-status-dot ${statusDot}"></span>
      ${slope.status || 'open'}
    </div>`;
}

// ── Draw lifts ────────────────────────────────────────────────────────────────
function _drawLifts() {
  if (!_map) return;
  state.lifts.forEach(lift => {
    if (!lift.bottom || !lift.top) return;
    const line = L.polyline([lift.bottom, lift.top], {
      color: '#00BCD4',
      weight: 2,
      dashArray: '6 4',
      opacity: 0.7,
    }).addTo(_map);
    line.bindPopup(_liftPopup(lift));
    line.on('click', () => line.openPopup());

    // Lift icon at midpoint
    const mid = [
      (lift.bottom[0] + lift.top[0]) / 2,
      (lift.bottom[1] + lift.top[1]) / 2,
    ];
    const icon = L.divIcon({
      className: '',
      html: _liftIconHtml(lift.type),
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker(mid, { icon }).addTo(_map)
      .bindPopup(_liftPopup(lift));
  });
}

function _liftIconHtml(type) {
  const icons = {
    gondola:   '&#x1F6A0;',
    chairlift: '&#x1F6CB;',
    tbar:      '&#x1F489;',
    carpet:    '&#x25AC;',
  };
  return `<div style="font-size:14px;text-align:center;line-height:20px">${icons[type] || '&#x1F6A0;'}</div>`;
}

function _liftPopup(lift) {
  return `<div class="popup-title">${lift.name}</div>
    <div class="popup-meta">
      Type: ${lift.type}<br>
      Capacity: ${lift.capacity_per_hour || '—'}/hr<br>
      Sector: ${lift.sector}
    </div>
    <div class="popup-status">
      <span class="popup-status-dot ${lift.status === 'open' ? 'open' : 'closed'}"></span>
      ${lift.status || 'open'}
    </div>`;
}

// ── Draw POIs ─────────────────────────────────────────────────────────────────
function _drawPOIs() {
  if (!_map) return;
  state.pois.forEach(poi => {
    if (!poi.lat || !poi.lng) return;
    const icon = L.divIcon({
      className: '',
      html: _poiIconHtml(poi.type),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker([poi.lat, poi.lng], { icon }).addTo(_map)
      .bindPopup(_poiPopup(poi));
  });
}

function _poiIconHtml(type) {
  const icons = {
    restaurant: '&#x1F374;',
    ticket:     '&#x1F3AB;',
    school:     '&#x1F3EB;',
    park:       '&#x1F3BF;',
    medical:    '&#x1F691;',
  };
  const bg = {
    restaurant: '#FF5722',
    ticket:     '#9C27B0',
    school:     '#3F51B5',
    park:       '#4CAF50',
    medical:    '#F44336',
  };
  const bgColor = bg[type] || '#607D8B';
  return `<div style="width:28px;height:28px;border-radius:50%;background:${bgColor};
    display:flex;align-items:center;justify-content:center;font-size:13px;
    border:2px solid rgba(255,255,255,0.3);box-shadow:0 2px 6px rgba(0,0,0,0.4)">
    ${icons[type] || '&#x2B50;'}
  </div>`;
}

function _poiPopup(poi) {
  return `<div class="popup-title">${poi.name}</div>
    <div class="popup-meta">${poi.description || ''}<br>
    ${poi.hours ? `Hours: ${poi.hours}` : ''}
    </div>`;
}

// ── GPS tracking marker ───────────────────────────────────────────────────────
window.updateMapGPS = function(lat, lng, heading) {
  if (!_map) return;
  if (!_gpsMarker) {
    const gpsIcon = L.divIcon({
      className: '',
      html: `<div class="gps-dot"><div class="gps-dot-pulse"></div><div class="gps-dot-inner"></div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    _gpsMarker = L.marker([lat, lng], { icon: gpsIcon, zIndexOffset: 1000 }).addTo(_map);
  } else {
    _gpsMarker.setLatLng([lat, lng]);
  }

  if (_autoPan) {
    _map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }

  // Update mini map too
  if (_miniMap) {
    _miniMap.panTo([lat, lng]);
  }
};

window.addTrailPoint = function(lat, lng) {
  if (!_map) return;
  if (!_trailLayer) {
    _trailLayer = L.polyline([[lat, lng]], {
      color: '#FF9800',
      weight: 3,
      opacity: 0.9,
    }).addTo(_map);
  } else {
    _trailLayer.addLatLng([lat, lng]);
  }
  // Update mini map trail
  if (_miniMap && _miniTrailLayer) {
    _miniTrailLayer.addLatLng([lat, lng]);
  }
};

window.clearTrail = function() {
  if (_trailLayer) {
    _map.removeLayer(_trailLayer);
    _trailLayer = null;
  }
  if (_miniMap && _miniTrailLayer) {
    _miniMap.removeLayer(_miniTrailLayer);
    _miniTrailLayer = null;
  }
};

// ── Locate me ─────────────────────────────────────────────────────────────────
function _locateMe() {
  if (!navigator.geolocation) {
    alert('Geolocation not supported on this device.');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    if (_map) {
      _map.flyTo([latitude, longitude], 15, { animate: true, duration: 1.5 });
    }
    window.updateMapGPS(latitude, longitude);
  }, err => {
    console.warn('[map] locate error:', err.message);
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// ── Auto pan toggle ────────────────────────────────────────────────────────────
function _toggleAutoPan() {
  _autoPan = !_autoPan;
  const btn = document.getElementById('btn-autopan');
  if (btn) btn.classList.toggle('active', _autoPan);
}

// ── Mini map ──────────────────────────────────────────────────────────────────
let _miniTrailLayer = null;

function _initMiniMap() {
  const el = document.getElementById('mini-map');
  if (!el || _miniMap) return;

  _miniMap = L.map('mini-map', {
    center: RESORT_CENTER,
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
  });

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    opacity: 0.8,
  }).addTo(_miniMap);

  // Draw slope outlines on mini map too
  if (state.slopes) {
    state.slopes.forEach(slope => {
      if (!slope.coordinates) return;
      L.polyline(slope.coordinates, {
        color: DIFF_COLOR[slope.difficulty] || '#888',
        weight: 1.5,
        opacity: 0.6,
      }).addTo(_miniMap);
    });
  }
}

// ── Highlight tour ────────────────────────────────────────────────────────────
const TOUR_SLOPES = {
  s:   ['s03', 's05', 's31', 's32', 's40', 's61'],
  m:   ['s01', 's02', 's10', 's30', 's41', 's50'],
  xxl: ['s01', 's41', 's50', 's60', 's10'],
  alt: ['s01', 's34', 's30', 's41', 's50'],
  fun: ['s16', 's34', 's10'],
};

let _tourHighlights = [];

window.highlightTour = function(tourId) {
  // Clear previous highlights
  _tourHighlights.forEach(l => _map && _map.removeLayer(l));
  _tourHighlights = [];

  const ids = TOUR_SLOPES[tourId] || [];
  if (!_map) return;

  ids.forEach(id => {
    const slope = state.slopes.find(s => s.id === id);
    if (!slope || !slope.coordinates) return;
    const l = L.polyline(slope.coordinates, {
      color: '#FFD740',
      weight: 6,
      opacity: 0.8,
    }).addTo(_map);
    _tourHighlights.push(l);
  });

  if (_tourHighlights.length > 0) {
    const group = L.featureGroup(_tourHighlights);
    _map.fitBounds(group.getBounds().pad(0.1));
  }
};
