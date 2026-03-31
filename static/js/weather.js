/* ── MayrhofenTracker — weather rendering ─────────────────────────────────── */

// Condition text → emoji (used when WeatherAPI icon not available)
function _condEmoji(text) {
  if (!text) return '🌡️';
  const t = text.toLowerCase();
  if (t.includes('thunder')) return '⛈️';
  if (t.includes('heavy snow') || t.includes('blizzard')) return '⛄';
  if (t.includes('snow shower')) return '🌨️';
  if (t.includes('snow') || t.includes('sleet') || t.includes('ice')) return '❄️';
  if (t.includes('heavy rain') || t.includes('heavy shower')) return '🌧️';
  if (t.includes('rain') || t.includes('shower') || t.includes('drizzle')) return '🌦️';
  if (t.includes('fog') || t.includes('mist') || t.includes('haze')) return '🌫️';
  if (t.includes('overcast') || t.includes('cloudy')) return '☁️';
  if (t.includes('partly') || t.includes('mostly cloudy')) return '⛅';
  if (t.includes('clear') || t.includes('sunny')) return '☀️';
  return '🌤️';
}

function _dayLabel(dateStr, idx) {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }); }
  catch { return dateStr; }
}

function _ageLabel(s) {
  if (!s || s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

window._loadWeather = async function() {
  const el = document.getElementById('weather-content');
  if (!el) return;
  el.innerHTML = '<span class="muted">Loading weather…</span>';
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
  const cur    = data.current  || {};
  const fcDays = data.forecast || [];
  const ageS   = data._cached_age_s ?? 0;
  const stale  = data._stale ? ' ⚠️' : '';

  const temp     = cur.temperature != null ? Math.round(cur.temperature) : '—';
  const feels    = cur.feels_like  != null ? Math.round(cur.feels_like)  : null;
  const wind     = cur.wind_kph    != null ? Math.round(cur.wind_kph)    : '—';
  const gusts    = cur.wind_gust_kph != null ? Math.round(cur.wind_gust_kph) : null;
  const humidity = cur.humidity    != null ? Math.round(cur.humidity)    : '—';
  const condition = cur.condition  || '';
  const icon      = cur.condition_icon;

  // Snow badge — any snow expected today or tomorrow?
  const snowDays = fcDays.filter(d => (d.total_snow_cm > 0 || d.chance_of_snow > 0));
  const snowBadge = snowDays.length > 0
    ? `<div class="snow-badge">❄️ SNOW EXPECTED — ${snowDays[0].total_snow_cm?.toFixed(1) || ''}cm</div>`
    : '';

  // Current icon
  const iconHtml = icon
    ? `<img src="${icon}" alt="${condition}" class="weather-icon-img" loading="lazy">`
    : `<span class="weather-emoji">${_condEmoji(condition)}</span>`;

  // 3-day forecast
  const forecastHtml = fcDays.slice(0, 3).map((d, i) => {
    const dayIcon = d.condition_icon
      ? `<img src="${d.condition_icon}" alt="" loading="lazy" style="width:32px;height:32px">`
      : `<span style="font-size:24px">${_condEmoji(d.condition)}</span>`;
    const snowNote = d.total_snow_cm > 0
      ? `<div class="forecast-snow">❄ ${d.total_snow_cm.toFixed(1)}cm</div>`
      : '';
    return `
      <div class="forecast-day">
        <div class="day-name">${_dayLabel(d.date, i)}</div>
        <div class="day-icon-wrap">${dayIcon}</div>
        <div class="day-temp">${Math.round(d.max_temp ?? 0)}° / ${Math.round(d.min_temp ?? 0)}°</div>
        ${snowNote}
      </div>`;
  }).join('');

  el.innerHTML = `
    ${snowBadge}
    <div class="weather-current">
      <div class="weather-icon-wrap">${iconHtml}</div>
      <div class="weather-main">
        <div class="weather-temp">${temp}°C</div>
        ${feels != null ? `<div class="weather-feels">Feels like ${feels}°C</div>` : ''}
        <div class="weather-desc">${condition}</div>
      </div>
    </div>
    <div class="weather-details-row">
      <span>💨 ${wind} km/h</span>
      ${gusts != null ? `<span>💥 Gusts ${gusts} km/h</span>` : ''}
      <span>💧 ${humidity}%</span>
    </div>
    <div class="forecast-row">${forecastHtml}</div>
    <div class="weather-footer">
      Updated ${_ageLabel(ageS)}${stale}
      <span class="weather-source">${data.source || ''}</span>
    </div>`;
}
