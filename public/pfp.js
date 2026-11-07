/* VexWalls — profile picture studio (Discord / Instagram / Steam).
 * CWPfp.open(src, info) opens a square cropper for any picture on our own site (or the site's
 * files from elsewhere: GitHub Pages allows cross-origin reads), with live previews and
 * 512 / 1024 px PNG downloads. Works with mouse, wheel, touch and pinch. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  let box, stage, img, zoomIn, st = null, openState = false;

  function build() {
    box = document.createElement('div');
    box.className = 'pfp';
    box.hidden = true;
    box.innerHTML = `
      <div class="pfp__backdrop" data-pclose></div>
      <div class="pfp__panel" role="dialog" aria-modal="true" aria-label="Profil resmi">
        <div class="pfp__head">
          <div><p class="eyebrow">Profil resmi</p><h3>Discord, Instagram, Steam için</h3></div>
          <button class="pfp__close" data-pclose aria-label="Kapat">✕</button>
        </div>
        <div class="pfp__body">
          <div class="pfp__left">
            <div class="pfp__stage" id="pfpStage"><div class="pfp__img" data-pv></div><div class="pfp__mask"></div></div>
            <div class="pfp__tools">
              <span>−</span><input type="range" id="pfpZoom" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştır"><span>+</span>
              <button class="chip" id="pfpShape" type="button">Kare göster</button>
            </div>
            <p class="pfp__hint">Sürükleyerek kaydır, tekerlek ya da iki parmakla yakınlaştır.</p>
          </div>
          <div class="pfp__right">
            <div class="pfp__pv pfp__pv--discord">
              <div class="pfp__banner"></div>
              <div class="pfp__av pfp__round" data-pv></div>
              <b>kullanıcı</b><span>Discord</span>
              <div class="pfp__msg"><div class="pfp__av pfp__av--sm pfp__round" data-pv></div><p><b>kullanıcı</b> selam! 👋</p></div>
            </div>
            <div class="pfp__row">
              <div class="pfp__pv pfp__pv--ig"><div class="pfp__ring"><div class="pfp__av pfp__round" data-pv></div></div><span>Instagram</span></div>
              <div class="pfp__pv pfp__pv--steam"><div class="pfp__av pfp__sq" data-pv></div><span>Steam</span></div>
            </div>
            <div class="pfp__dl">
              <button class="btn btn--primary" data-size="1024">⬇ İndir · 1024 px</button>
              <button class="btn" data-size="512">⬇ 512 px</button>
            </div>
            <p class="note">PNG, kare. Discord ve Instagram resmi daire olarak gösterir; Steam kare. Kaynak: <a id="pfpSrc" target="_blank" rel="noopener">Wallhaven ↗</a></p>
          </div>
        </div>
      </div>`;
    document.body.append(box);
    stage = $('#pfpStage', box);
    zoomIn = $('#pfpZoom', box);
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-pclose]')) return close();
      const d = e.target.closest('[data-size]'); if (d) download(+d.dataset.size);
    });
    $('#pfpShape', box).onclick = (e) => { const sq = stage.classList.toggle('is-square'); e.target.textContent = sq ? 'Daire göster' : 'Kare göster'; };
    zoomIn.oninput = () => zoomTo(+zoomIn.value);
    // drag + pinch
    const pts = new Map(); let pinch = 0;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    stage.addEventListener('pointermove', (e) => {
      if (!st || !pts.has(e.pointerId)) return;
      const [px, py] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoomTo(st.z * d / pinch); pinch = d; return;
      }
      st.x += e.clientX - px; st.y += e.clientY - py; draw();
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault(); if (!st) return;
      const r = stage.getBoundingClientRect();
      zoomTo(st.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    addEventListener('resize', () => st && draw());
    document.addEventListener('keydown', (e) => { if (openState && e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }, true);
  }

  // st: x/y = picture position inside the square (in stage px), z = zoom (1 = picture just covers it)
  const V = () => stage.clientWidth || 1;
  const scale = () => (V() / Math.min(img.naturalWidth, img.naturalHeight)) * st.z;
  function clamp() {
    const s = scale(), w = img.naturalWidth * s, h = img.naturalHeight * s, v = V();
    st.x = Math.min(0, Math.max(v - w, st.x)); st.y = Math.min(0, Math.max(v - h, st.y));
  }
  function zoomTo(z, cx, cy) {
    if (!st) return;
    const v = V(); if (cx == null) { cx = v / 2; cy = v / 2; }
    z = Math.min(4, Math.max(1, z));
    const k = z / st.z; st.x = cx - (cx - st.x) * k; st.y = cy - (cy - st.y) * k; st.z = z;
    zoomIn.value = z; draw();
  }
  function draw() {
    if (!st) return;
    clamp();
    const s = scale(), v = V();
    box.querySelectorAll('[data-pv]').forEach((p) => {
      const k = (p.clientWidth || v) / v;
      p.style.backgroundImage = `url("${img.src}")`;
      p.style.backgroundSize = `${img.naturalWidth * s * k}px ${img.naturalHeight * s * k}px`;
      p.style.backgroundPosition = `${st.x * k}px ${st.y * k}px`;
    });
  }

  function download(n) {
    if (!st) return;
    const s = scale(), c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, -st.x / s, -st.y / s, V() / s, V() / s, 0, 0, n, n);
    const name = `vexwalls-profil-${st.id || 'resim'}-${n}.png`;
    try {
      c.toBlob(async (b) => {
        if (!b) return fail();
        const file = new File([b], name, { type: 'image/png' });
        // phones: the share sheet has "Save image" (a plain download lands in Files on iPhone)
        if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
        }
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        window.CryWall?.toast?.('Profil resmi indirildi', `${n}×${n} PNG`, 'ok');
      }, 'image/png');
    } catch { fail(); }
  }
  const fail = () => window.CryWall?.toast?.('İndirilemedi', 'Bu görsel kırpılamıyor, başka birini dene.', 'err');

  function open(src, info = {}) {
    if (!box) build();
    st = null;
    box.hidden = false; openState = true; document.body.style.overflow = 'hidden';
    if (!history.state || !history.state.pfp) history.pushState({ ...(history.state || {}), pfp: true }, '');
    box.querySelectorAll('[data-pv]').forEach((p) => (p.style.backgroundImage = ''));
    stage.classList.toggle('is-square', false); $('#pfpShape', box).textContent = 'Kare göster';
    const a = $('#pfpSrc', box); a.href = info.page || 'https://wallhaven.cc';
    img = new Image();
    img.crossOrigin = 'anonymous';           // so the canvas may export it
    img.onload = () => {
      st = { x: 0, y: 0, z: 1, id: info.id };
      const s = scale(), v = V();
      st.x = (v - img.naturalWidth * s) / 2; st.y = (v - img.naturalHeight * s) / 2;   // start centred
      zoomIn.value = 1; draw();
    };
    img.onerror = () => { fail(); close(); };
    img.src = src;
  }
  function close(fromHistory = false) {
    if (!box || box.hidden) return;
    box.hidden = true; openState = false; st = null;
    if (!document.querySelector('#viewer:not([hidden])')) document.body.style.overflow = '';
    if (!fromHistory && history.state && history.state.pfp) { const s = { ...history.state }; delete s.pfp; history.replaceState(s, ''); }
  }
  window.CWPfp = { open, close, isOpen: () => openState };
})();
