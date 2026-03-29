/* ── MayrhofenTracker — weather ──────────────────────────────────────────────── */

const WMO_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Foggy', '🌫'],
  48: ['Icy fog', '🌫'],
  51: ['Light drizzle', '🌦'],
  61: ['Light rain', '🌧'],
  71: ['Light snow', '🌨'],
  73: ['Moderate snow', '❄️'],
  75: ['Heavy snow', '⛄'],
  80: ['Rain showers', '🌦'],
  85: ['Snow showers', '🌨'],
  95: ['Thunderstorm', '⛈'],
};

function _wmoDesc(code) {
  if (WMO_CODES[code]) return WMO_CODES[code];
  // Find closest
  const c = Object.keys(WMO_CODES).map(Number).sort((a,b)=>a-b).find(k => k >= code);
  return WMO_CODES[c] || ['Unknown', '🌡'];
}

function _dayName(dateStr, idx) {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en', { weekday: 'short' });
}

window._loadWeather = async function() {
  const el = document.getElementById('weather-content');
  if (!el) return;
  try {
    const res = await fetch('/api/weather');
    if (!res.ok) { el.innerHTML = '<span class="muted">Weather unavailable</span>'; return; }
    const data = await res.json();
    if (data.error) { el.innerHTML = `<span class="muted">Weather error: ${data.error}</span>`; return; }

    const cur = data.current;
    const temp = Math.round(cur?.temperature_2m ?? 0);
    const wind = Math.round(cur?.windspeed_10m ?? 0);
    const snow = (cur?.snowfall ?? 0).toFixed(1);
    const code = cur?.weathercode ?? 0;
    const [desc, icon] = _wmoDesc(code);

    const daily = data.daily || {};
    const days  = (daily.time || []).slice(0, 3);

    el.innerHTML = `
      <div class="weather-current">
        <span class="weather-icon">${icon}</span>
        <div>
          <div class="weather-temp">${temp}°C</div>
          <div class="weather-details">${desc} &nbsp;|&nbsp; 💨 ${wind} km/h &nbsp;|&nbsp; ❄️ ${snow} mm</div>
        </div>
      </div>
      <div class="weather-forecast">
        ${days.map((d, i) => {
          const maxT = Math.round(daily.temperature_2m_max?.[i] ?? 0);
          const minT = Math.round(daily.temperature_2m_min?.[i] ?? 0);
          const snow = (daily.snowfall_sum?.[i] ?? 0).toFixed(0);
          const wc   = daily.weathercode?.[i] ?? 0;
          const [, dayIcon] = _wmoDesc(wc);
          return `<div class="weather-day">
            <div class="day-name">${_dayName(d, i)}</div>
            <div class="day-icon">${dayIcon}</div>
            <div class="day-temp">${maxT}° / ${minT}°</div>
            ${snow > 0 ? `<div style="font-size:0.7rem;color:var(--accent)">❄ ${snow}mm</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  } catch (e) {
    console.error('[weather]', e);
    el.innerHTML = '<span class="muted">Weather unavailable</span>';
  }
};
