/* ── MayrhofenTracker — Live Webcams ─────────────────────────────────────────── */

const WEBCAMS = [
  {
    name: 'Penken Summit',
    elev: '2,000m',
    image: 'https://www.foto-webcam.eu/webcam/mayrhofen-penken/current/1920.jpg',
    link:  'https://www.mayrhofen.at/en/pages/livecams',
  },
  {
    name: 'Ahorn Summit',
    elev: '1,965m',
    image: 'https://www.foto-webcam.eu/webcam/mayrhofen-ahorn/current/1920.jpg',
    link:  'https://www.mayrhofen.at/en/pages/livecams',
  },
  {
    name: 'Mayrhofen Village',
    elev: '630m',
    image: 'https://www.foto-webcam.eu/webcam/mayrhofen/current/1920.jpg',
    link:  'https://www.mayrhofen.at/en/pages/livecams',
  },
  {
    name: 'Hintertux Glacier',
    elev: '3,250m',
    image: 'https://www.foto-webcam.eu/webcam/hintertux/current/1920.jpg',
    link:  'https://www.hintertux.at/en/webcams',
  },
];

let _webcamTimer = null;

window._initWebcams = function () {
  _renderWebcams();
  _webcamTimer = setInterval(_refreshWebcams, 5 * 60 * 1000);

  // Lightbox close
  document.getElementById('webcam-lightbox-close')?.addEventListener('click', _closeLightbox);
  document.getElementById('webcam-lightbox')?.addEventListener('click', e => {
    if (e.target === document.getElementById('webcam-lightbox')) _closeLightbox();
  });
};

function _renderWebcams() {
  const row = document.getElementById('webcams-row');
  if (!row) return;

  row.innerHTML = WEBCAMS.map((cam, i) => `
    <div class="webcam-card" data-idx="${i}">
      <img
        id="wcimg-${i}"
        src="${cam.image}?t=${Date.now()}"
        alt="${cam.name}"
        loading="lazy"
        onerror="window._webcamImgError(${i})"
      >
      <div class="webcam-card-overlay">
        <div class="webcam-name">${cam.name}</div>
        <div class="webcam-elev">${cam.elev}</div>
      </div>
    </div>
  `).join('');

  row.querySelectorAll('.webcam-card').forEach(card => {
    card.addEventListener('click', () => _openLightbox(parseInt(card.dataset.idx)));
  });

  _updateLabel();
}

function _refreshWebcams() {
  WEBCAMS.forEach((cam, i) => {
    const img = document.getElementById(`wcimg-${i}`);
    if (!img) return;
    const fresh = `${cam.image}?t=${Date.now()}`;
    img.src = fresh;
    img.onerror = () => window._webcamImgError(i);
  });
  _updateLabel();
}

window._webcamImgError = function (idx) {
  const img = document.getElementById(`wcimg-${idx}`);
  if (!img) return;
  // Replace img with offline placeholder
  const card = img.closest('.webcam-card');
  if (!card) return;
  img.style.display = 'none';
  if (!card.querySelector('.webcam-offline')) {
    const ph = document.createElement('div');
    ph.className = 'webcam-offline';
    ph.innerHTML = `<span>📷</span><span>Camera offline</span>`;
    card.insertBefore(ph, img);
  }
  // Still allow tap to open official page
  card.dataset.offline = '1';
};

function _openLightbox(idx) {
  const cam = WEBCAMS[idx];
  const card = document.querySelector(`.webcam-card[data-idx="${idx}"]`);
  const isOffline = card?.dataset.offline === '1';

  if (isOffline) {
    window.open(cam.link, '_blank');
    return;
  }

  const lb     = document.getElementById('webcam-lightbox');
  const lbImg  = document.getElementById('webcam-lightbox-img');
  const lbLbl  = document.getElementById('webcam-lightbox-label');
  if (!lb || !lbImg) return;

  lbImg.src = `${cam.image}?t=${Date.now()}`;
  lbImg.onerror = () => { window.open(cam.link, '_blank'); _closeLightbox(); };
  if (lbLbl) lbLbl.textContent = `${cam.name} — ${cam.elev}`;
  lb.style.display = 'flex';

  // Long-press / double-tap to open official page
  lbImg.ondblclick = () => window.open(cam.link, '_blank');
}

function _closeLightbox() {
  const lb = document.getElementById('webcam-lightbox');
  if (lb) lb.style.display = 'none';
}

function _updateLabel() {
  const el = document.getElementById('webcam-update-label');
  if (!el) return;
  const now = new Date();
  el.textContent = `Updated ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
}
