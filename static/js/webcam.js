/* ── MayrhofenTracker — Live Webcams ─────────────────────────────────────────── */

const WEBCAMS = [
  {
    name:  'Penken Summit',
    elev:  '2,000m',
    icon:  '⛷',
    link:  'https://www.bergfex.com/mayrhofen/webcams/c886/',
  },
  {
    name:  'Ahorn Summit',
    elev:  '1,965m',
    icon:  '🏔',
    link:  'https://www.bergfex.com/mayrhofen/webcams/c887/',
  },
  {
    name:  'Penken Park',
    elev:  '1,800m',
    icon:  '🎿',
    link:  'https://www.bergfex.com/mayrhofen/webcams/c10939/',
  },
  {
    name:  'Rastkogel',
    elev:  '2,120m',
    icon:  '📷',
    link:  'https://www.bergfex.com/mayrhofen/webcams/c10940/',
  },
  {
    name:  'Hintertux Glacier',
    elev:  '3,250m',
    icon:  '🧊',
    link:  'https://www.bergfex.com/hintertuxer-gletscher/webcams/',
  },
];

window._initWebcams = function () {
  _renderWebcams();
  // hide the lightbox HTML since we no longer use it
  const lb = document.getElementById('webcam-lightbox');
  if (lb) lb.style.display = 'none';
};

function _renderWebcams() {
  const row = document.getElementById('webcams-row');
  if (!row) return;

  row.innerHTML = WEBCAMS.map((cam, i) => `
    <div class="webcam-card webcam-link-card" data-idx="${i}">
      <div class="webcam-link-icon">${cam.icon}</div>
      <div class="webcam-link-name">${cam.name}</div>
      <div class="webcam-elev">${cam.elev}</div>
      <div class="webcam-link-cta">View Live →</div>
    </div>
  `).join('');

  row.querySelectorAll('.webcam-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      window.open(WEBCAMS[idx].link, '_blank');
    });
  });
}
