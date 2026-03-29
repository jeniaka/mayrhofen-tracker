/* ── MayrhofenTracker — weather ──────────────────────────────────────────────── */

const WMO_CODES = {
  0:  ['Clear sky',       '☀️'],
  1:  ['Mainly clear',    '🌤️'],
  2:  ['Partly cloudy',   '⛅'],
  3:  ['Overcast',        '☁️'],
  45: ['Foggy',           '🌫️'],
  48: ['Icy fog',         '🌫️'],
  51: ['Light drizzle',   '🌦️'],
  53: ['Drizzle',         '🌦️'],
  55: ['Heavy drizzle',   '🌧️'],
  61: ['Light rain',      '🌧️'],
  63: ['Rain',            '🌧️'],
  65: ['Heavy rain',      '🌧️'],
  71: ['Light snow',      '🌨️'],
  73: ['Moderate snow',   '❄️'],
  75: ['Heavy snow',      '⛄'],
  77: ['Snow grains',     '🌨️'],
  80: ['Rain showers',    '🌦️'],
  81: ['Rain showers',    '🌧️'],
  82: ['Heavy showers',   '🌧️'],
  85: ['Snow showers',    '🌨️'],
  86: ['Heavy snow shower','⛄'],
  95: ['Thunderstorm',    '⛈️'],
  96: ['Thunderstorm',    '⛈️'],
  99: ['Thunderstorm',    '⛈️'],
};

function _wmoDesc(code) {
  if (WMO_CODES[code]) return WMO_CODES[code];
  const keys = Object.keys(WMO_CODES).map(Number).sort((a, b) => a - b);
  const closest = keys.find(k => k >= code) ?? keys[keys.length - 1];
  return WMO_CODES[closest] || ['Unknown', '🌡️'];
}

function _dayLabel(dateStr, idx) {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' });
}

function _windDir(deg) {
  if (deg == null) return '';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function _fmtTime(iso) {
  if (!iso) return '—';
  return iso.slice(11, 16);
}

function _ageLabel(ageS) {
  if (ageS < 60) return 'just now';
  if (ageS < 3600) return `${Math.floor(ageS / 60)} min ago`;
  return `${Math.floor(ageS / 3600)}h ago`;
}

window._loadWeather = async function () {
  const el = document.getElementById('weather-content');
  if (!el) return;
  el.innerHTML = '<span class="muted">Loading weather...</span>';
  try {
    const res = await fetch('/api/weather');
    if (!res.ok) { el.innerHTML = '<span class="muted">Weather unavailable</span>'; return; }
    const data = await res.json();
    if (data.error) { el.innerHTML = `<span class="muted">⚠️ ${data.error}</span>`; return; }
    _renderWeather(el, data);
  } catch (e) {
    console.error('[weather]', e);
    el.innerHTML = '<span class="muted">Weather unavailable</span>';
  }
};

function _renderWeather(el, data) {
  const cur   = data.current || {};
  const daily = data.daily   || {};
  const ageS  = data._cached_age_s ?? 0;
  const stale = data._stale ? ' ⚠️ stale' : '';

  const temp     = Math.round(cur.temperature_2m ?? 0);
  const feels    = Math.round(cur.apparent_temperature ?? temp);
  const humidity = Math.round(cur.relative_humidity_2m ?? 0);
  const wind     = Math.round(cur.wind_speed_10m ?? 0);
  const gusts    = Math.round(cur.wind_gusts_10m ?? 0);
  const windDir  = _windDir(cur.wind_direction_10m);
  const code     = cur.weather_code ?? 0;
  const [desc, icon] = _wmoDesc(code);

  const days     = (daily.time || []).slice(0, 3);
  const sunrise  = daily.sunrise?.[0]  ? _fmtTime(daily.sunrise[0])  : '—';
  const sunset   = daily.sunset?.[0]   ? _fmtTime(daily.sunset[0])   : '—';

  // Snow alert: any snowfall expected in next 24h
  const snow24h  = (daily.snowfall_sum?.[0] ?? 0);
  const snowBadge = snow24h > 0
    ? `<div class="snow-badge">❄️ SNOW EXPECTED — ${snow24h.toFixed(0)} mm today</div>`
    : '';

  const forecastCards = days.map((d, i) => {
    const maxT = Math.round(daily.temperature_2m_max?.[i] ?? 0);
    const minT = Math.round(daily.temperature_2m_min?.[i] ?? 0);
    const snowD = (daily.snowfall_sum?.[i] ?? 0);
    const wc   = daily.weather_code?.[i] ?? 0;
    const [, dayIcon] = _wmoDesc(wc);
    return `
      <div class="weather-day">
        <div class="day-name">${_dayLabel(d, i)}</div>
        <div class="day-icon">${dayIcon}</div>
        <div class="day-temp">${maxT}° / ${minT}°</div>
        ${snowD > 0 ? `<div class="day-snow">❄ ${snowD.toFixed(0)}mm</div>` : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    ${snowBadge}
    <div class="weather-current">
      <span class="weather-icon">${icon}</span>
      <div class="weather-main">
        <div class="weather-temp">${temp}°C</div>
        <div class="weather-feels">Feels like ${feels}°C</div>
        <div class="weather-desc">${desc}</div>
      </div>
    </div>
    <div class="weather-details-row">
      <span>💨 ${wind} km/h ${windDir}</span>
      <span>💥 Gusts ${gusts} km/h</span>
      <span>💧 ${humidity}%</span>
    </div>
    <div class="weather-details-row" style="margin-top:4px">
      <span>🌅 ${sunrise}</span>
      <span>🌇 ${sunset}</span>
      <span class="weather-updated">Updated ${_ageLabel(ageS)}${stale}</span>
    </div>
    <div class="weather-forecast">${forecastCards}</div>`;
}
