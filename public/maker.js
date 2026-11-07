/* VexWalls — "Oluştur" studio: make your own wallpaper (static or animated).
 * Background: colour gradient, aurora, solid colour, your own photo, or AI (Pollinations, free).
 * Then effects, text, motion (zoom, snow, rain, stars, fireflies, colour flow) and export:
 * PNG at the chosen size, an MP4/WebM loop, or (PC helper) apply directly to the desktop.
 * Everything is drawn by render(ctx, W, H, t): the preview and the export use the same code. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const T = (s) => (window.T ? window.T(s) : s);
  const dpr = window.devicePixelRatio || 1;
  const SIZES = [
    ['screen', 'Bu ekran', Math.round(screen.width * dpr), Math.round(screen.height * dpr)],
    ['fhd', 'Full HD', 1920, 1080], ['qhd', '2K', 2560, 1440], ['uhd', '4K', 3840, 2160],
    ['uw', 'Ultra geniş', 3440, 1440], ['phone', 'Telefon', 1080, 2400], ['iphone', 'iPhone', 1290, 2796],
  ];
  const PALETTES = [
    ['#0f2027', '#203a43', '#2c5364'], ['#ff512f', '#dd2476', '#1a0b2e'], ['#00c6ff', '#0072ff', '#0b1023'],
    ['#f7971e', '#ffd200', '#2b1700'], ['#8e2de2', '#4a00e0', '#0a0420'], ['#11998e', '#38ef7d', '#06281e'],
    ['#fc5c7d', '#6a82fb', '#120c2c'], ['#232526', '#414345', '#000000'], ['#ff9a9e', '#fecfef', '#a18cd1'],
    ['#43cea2', '#185a9d', '#07142b'],
  ];
  const STYLES = [['', 'Serbest'], ['anime art style, vibrant, detailed background', 'Anime'], ['photorealistic, 8k photography, cinematic lighting', 'Gerçekçi'],
    ['epic fantasy concept art, dramatic lighting', 'Fantastik'], ['cyberpunk, neon lights, futuristic', 'Siberpunk'], ['minimalist, clean, flat colors', 'Minimal'],
    ['oil painting, brush strokes', 'Yağlı boya'], ['pixel art, 16-bit', 'Piksel'], ['dark gothic, moody, mysterious', 'Karanlık']];
  const MOTIONS = [['none', 'Yok'], ['zoom', 'Yavaş yakınlaşma'], ['pan', 'Kayma'], ['flow', 'Renk akışı'], ['snow', 'Kar'], ['rain', 'Yağmur'],
    ['stars', 'Yıldızlar'], ['fireflies', 'Ateş böcekleri'], ['bubbles', 'Baloncuklar'], ['petals', 'Yapraklar']];
  const FONTS = [['Plus Jakarta Sans', 'Yumuşak'], ['Space Grotesk', 'Modern'], ['Inter', 'Sade'], ['Georgia', 'Klasik'], ['Courier New', 'Daktilo'], ['Impact', 'Kalın']];
  // never sent to the AI: franchise characters / adult content (same idea as the site's filter)
  const BLOCK = /\b(joker|batman|shaco|league of legends|lol|pokemon|pikachu|naruto|goku|marvel|spider-?man|disney|mickey|elsa|harry potter|star wars|mario|sonic|genshin|valorant|fortnite|minecraft|nude|naked|nsfw|sex|porn|çıplak|ciplak|seks|erotik|gore)\b/i;

  const S = {
    size: 'screen', bg: 'gradient', colors: PALETTES[2].slice(), angle: 135, seed: 7, solid: '#101320',
    img: null, imgZoom: 1, imgX: 0.5, imgY: 0.5,
    blur: 0, bright: 100, sat: 100, grain: 0, vignette: 30, dark: 0,
    text: '', font: 'Plus Jakarta Sans', textSize: 90, textColor: '#ffffff', glow: true, tx: 0.5, ty: 0.5, bold: true,
    motion: 'none', speed: 1, style: '', prompt: '',
  };
  const LOOP = 10;                       // seconds; every motion is periodic, so the video loops seamlessly
  let box, cv, ctx, raf = 0, t0 = performance.now(), grainTile = null, aiBusy = false, aiReady = 0;

  // ---------- tiny deterministic random ----------
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }
  function particles(n, seed) { const r = rng(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: r(), p: r(), k: r() })); }
  let PARTS = particles(140, 3);

  const sizeOf = () => { const z = SIZES.find((x) => x[0] === S.size) || SIZES[1]; return [z[2], z[3]]; };

  // ---------- drawing ----------
  function drawBackground(c, W, H, t) {
    const ph = (2 * Math.PI * t) / LOOP;
    if (S.bg === 'gradient') {
      const a = (S.angle + (S.motion === 'flow' ? Math.sin(ph) * 25 : 0)) * Math.PI / 180;
      const r = Math.hypot(W, H) / 2, cx = W / 2, cy = H / 2;
      const g = c.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      S.colors.forEach((col, i) => g.addColorStop(i / (S.colors.length - 1), col));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else if (S.bg === 'aurora') {
      c.fillStyle = S.colors[2]; c.fillRect(0, 0, W, H);
      const r = rng(S.seed), m = Math.max(W, H);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const bx = r(), by = r(), rad = (0.35 + r() * 0.4) * m, col = S.colors[i % 2];
        const mv = S.motion === 'flow' ? 0.08 : 0.015;
        const x = (bx + Math.cos(ph + i) * mv) * W, y = (by + Math.sin(ph * (i % 2 ? 1 : -1) + i) * mv) * H;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      c.globalCompositeOperation = 'source-over';
    } else if (S.bg === 'solid') {
      c.fillStyle = S.solid; c.fillRect(0, 0, W, H);
    } else if (S.img) {
      // AI pictures: the free service stamps its name in the bottom-right corner, so the bottom strip is left out
      const iw = S.img.naturalWidth, ih = S.img.naturalHeight * (S.imgSrc === 'ai' ? 0.92 : 1);
      let z = S.imgZoom;
      if (S.motion === 'zoom') z *= 1 + 0.07 * (0.5 - 0.5 * Math.cos(ph));
      const sc = Math.max(W / iw, H / ih) * z, dw = iw * sc, dh = ih * sc;
      let fx = S.imgX, fy = S.imgY;
      if (S.motion === 'pan') fx = 0.5 + Math.sin(ph) * 0.5;
      const dx = (W - dw) * fx, dy = (H - dh) * fy;
      c.drawImage(S.img, 0, 0, iw, ih, dx, dy, dw, dh);
    } else {
      c.fillStyle = '#0b0d14'; c.fillRect(0, 0, W, H);
    }
  }

  function drawParticles(c, W, H, t) {
    const m = S.motion, u = Math.min(W, H) / 1080, ph = t / LOOP;
    if (!['snow', 'rain', 'stars', 'fireflies', 'bubbles', 'petals'].includes(m)) return;
    c.save();
    PARTS.forEach((p, i) => {
      if (m === 'snow') {
        const y = ((p.y + ph * (1 + Math.floor(p.s * 2))) % 1) * (H + 40) - 20;
        const x = (p.x + Math.sin(2 * Math.PI * (ph * 2 + p.p)) * 0.01) * W;
        c.fillStyle = `rgba(255,255,255,${0.5 + p.k * 0.5})`; c.beginPath(); c.arc(x, y, (1.5 + p.s * 3.5) * u, 0, 7); c.fill();
      } else if (m === 'rain') {
        if (i > 110) return;
        const n = 2 + Math.floor(p.s * 3), y = ((p.y + ph * n) % 1) * (H + 120) - 60, x = p.x * W, l = (30 + p.s * 40) * u;
        c.strokeStyle = `rgba(190,210,255,${0.25 + p.k * 0.35})`; c.lineWidth = 1.3 * u;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - l * 0.15, y + l); c.stroke();
      } else if (m === 'stars') {
        const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (ph * (1 + Math.floor(p.s * 3)) + p.p)));
        c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.arc(p.x * W, p.y * H, (0.8 + p.k * 1.8) * u, 0, 7); c.fill();
      } else if (m === 'fireflies') {
        if (i > 45) return;
        const x = (p.x + Math.sin(2 * Math.PI * (ph + p.p)) * 0.04) * W, y = (p.y + Math.cos(2 * Math.PI * (ph * 2 + p.k)) * 0.03) * H;
        const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * (ph * 3 + p.p)), r = (6 + p.s * 8) * u;
        const g = c.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, `rgba(255,236,150,${a})`); g.addColorStop(1, 'rgba(255,236,150,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 3, 0, 7); c.fill();
      } else if (m === 'bubbles') {
        if (i > 50) return;
        const y = H + 60 - ((p.y + ph * (1 + Math.floor(p.s * 2))) % 1) * (H + 120);
        const x = (p.x + Math.sin(2 * Math.PI * (ph * 2 + p.p)) * 0.015) * W, r = (6 + p.s * 22) * u;
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
      } else if (m === 'petals') {
        if (i > 70) return;
        const y = ((p.y + ph * (1 + Math.floor(p.s * 2))) % 1) * (H + 60) - 30;
        const x = ((p.x + ph * 0.5 + Math.sin(2 * Math.PI * (ph * 2 + p.p)) * 0.02) % 1) * W;
        c.save(); c.translate(x, y); c.rotate(2 * Math.PI * (ph * 2 + p.k));
        c.fillStyle = `rgba(255,${150 + Math.floor(p.k * 60)},${190 + Math.floor(p.s * 40)},.85)`;
        c.beginPath(); c.ellipse(0, 0, (7 + p.s * 6) * u, (4 + p.s * 3) * u, 0, 0, 7); c.fill(); c.restore();
      }
    });
    c.restore();
  }

  function grainPattern(c) {
    if (!grainTile) {
      grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 160;
      const g = grainTile.getContext('2d'), d = g.createImageData(160, 160), r = rng(99);
      for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    }
    return c.createPattern(grainTile, 'repeat');
  }

  function render(c, W, H, t) {
    c.save();
    const f = [];
    if (S.blur) f.push(`blur(${(S.blur * Math.min(W, H)) / 1080}px)`);
    if (S.bright !== 100) f.push(`brightness(${S.bright}%)`);
    if (S.sat !== 100) f.push(`saturate(${S.sat}%)`);
    c.filter = f.length ? f.join(' ') : 'none';
    if (S.blur) { const p = S.blur * 2 * Math.min(W, H) / 1080; c.translate(-p, -p); c.scale((W + 2 * p) / W, (H + 2 * p) / H); }   // no faded edges
    drawBackground(c, W, H, t);
    c.restore();
    if (S.dark) { c.fillStyle = `rgba(0,0,0,${S.dark / 100})`; c.fillRect(0, 0, W, H); }
    drawParticles(c, W, H, t);
    if (S.vignette) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${S.vignette / 100})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (S.grain) { c.save(); c.globalAlpha = S.grain / 250; c.globalCompositeOperation = 'overlay'; c.fillStyle = grainPattern(c); c.fillRect(0, 0, W, H); c.restore(); }
    if (S.text.trim()) {
      const fs = (S.textSize * Math.min(W, H)) / 1080;
      c.save();
      c.font = `${S.bold ? 700 : 400} ${fs}px "${S.font}", sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = S.textColor;
      if (S.glow) { c.shadowColor = S.textColor; c.shadowBlur = fs * 0.35; } else { c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = fs * 0.12; c.shadowOffsetY = fs * 0.04; }
      const lines = S.text.split('\n');
      lines.forEach((l, i) => c.fillText(l, S.tx * W, S.ty * H + (i - (lines.length - 1) / 2) * fs * 1.15));
      c.restore();
    }
  }

  // ---------- preview ----------
  function fit() {
    const [W, H] = sizeOf(), wrap = $('.mk__stage', box);
    const aw = wrap.clientWidth, ah = wrap.clientHeight, k = Math.min(aw / W, ah / H);
    cv.style.width = Math.round(W * k) + 'px'; cv.style.height = Math.round(H * k) + 'px';
    const pr = Math.min(dpr, 2);
    cv.width = Math.round(W * k * pr); cv.height = Math.round(H * k * pr);
    draw();
  }
  function draw() { if (cv) render(ctx, cv.width, cv.height, ((performance.now() - t0) / 1000) * S.speed % LOOP); }
  function loop() { draw(); raf = S.motion !== 'none' && !box.hidden ? requestAnimationFrame(loop) : 0; }
  function changed() { if (!raf) loop(); }

  // ---------- UI ----------
  const chips = (name, list, cur) => list.map(([k, n]) => `<button type="button" class="chip${k === cur ? ' is-active' : ''}" data-${name}="${k}">${n}</button>`).join('');
  const range = (k, label, min, max, step = 1) => `<label class="mk__range"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></label>`;
  function panel() {
    const helper = window.CryWall && window.CryWall.helperBase && window.CryWall.helperBase() !== null;
    return `
      <section><h4>Boyut</h4><div class="mk__chips">${chips('size', SIZES.map((z) => [z[0], `${z[1]} <small>${z[2]}×${z[3]}</small>`]), S.size)}</div></section>
      <section><h4>Arka plan</h4><div class="mk__chips">${chips('bg', [['gradient', 'Renk geçişi'], ['aurora', 'Aurora'], ['solid', 'Düz renk'], ['photo', 'Fotoğrafım'], ['ai', '✨ Yapay zeka']], S.bg)}</div>
        <div class="mk__sub" data-show="gradient aurora">
          <div class="mk__colors">${S.colors.map((c, i) => `<input type="color" data-color="${i}" value="${c}" aria-label="Renk ${i + 1}">`).join('')}
            <button type="button" class="btn btn--sm" data-act="random">🎲 Rastgele</button></div>
          <div class="mk__pals">${PALETTES.map((p, i) => `<button type="button" data-pal="${i}" style="background:linear-gradient(135deg,${p.join(',')})" aria-label="Renk paleti ${i + 1}"></button>`).join('')}</div>
          <div data-show="gradient">${range('angle', 'Açı', 0, 360)}</div>
          <div data-show="aurora"><button type="button" class="btn btn--sm" data-act="reseed">🔀 Yeniden karıştır</button></div>
        </div>
        <div class="mk__sub" data-show="solid"><input type="color" data-k="solid" value="${S.solid}" aria-label="Renk"></div>
        <div class="mk__sub" data-show="photo">
          <label class="btn btn--sm mk__file">📁 Fotoğraf seç<input type="file" accept="image/*" hidden></label>
          <p class="mk__hint">Fotoğrafın bilgisayarından çıkmaz; her şey tarayıcında yapılır. Önizlemede sürükleyerek konumunu ayarla.</p>
          ${range('imgZoom', 'Yakınlaştır', 1, 3, 0.01)}
        </div>
        <div class="mk__sub" data-show="ai">
          <textarea id="mkPrompt" rows="3" maxlength="300" placeholder="Ne istediğini yaz… örn: gece yarısı karlı dağlarda yalnız bir samuray, kırmızı ay">${S.prompt}</textarea>
          <div class="mk__chips mk__chips--sm">${chips('style', STYLES, S.style)}</div>
          <button type="button" class="btn btn--primary" data-act="ai">✨ Oluştur</button>
          <p class="mk__hint">Ücretsiz yapay zeka (Pollinations). Her seferinde farklı bir resim çıkar, 5–20 saniye sürer. Ücretsiz sürüm resmi yaklaşık 1024 px çizer (büyük ekranda biraz yumuşak görünebilir). Telifli karakterler (Joker, LoL, Pokémon…) ve uygunsuz içerik oluşturulamaz.</p>
          ${range('imgZoom', 'Yakınlaştır', 1, 3, 0.01)}
        </div>
      </section>
      <section><h4>Efektler</h4>
        ${range('blur', 'Bulanıklık', 0, 40)}${range('bright', 'Parlaklık', 40, 160)}${range('sat', 'Canlılık', 0, 200)}
        ${range('dark', 'Karartma', 0, 80)}${range('vignette', 'Kenar gölgesi', 0, 90)}${range('grain', 'Film greni', 0, 100)}
      </section>
      <section><h4>Yazı</h4>
        <textarea data-k="text" rows="2" maxlength="120" placeholder="İstersen bir yazı ekle (isim, söz…)">${S.text}</textarea>
        <div class="mk__chips mk__chips--sm">${chips('font', FONTS, S.font)}</div>
        <div class="mk__row">${range('textSize', 'Boyut', 20, 260)}<input type="color" data-k="textColor" value="${S.textColor}" aria-label="Yazı rengi"></div>
        <label class="mk__check"><input type="checkbox" data-k="glow" ${S.glow ? 'checked' : ''}> Parlama</label>
        <label class="mk__check"><input type="checkbox" data-k="bold" ${S.bold ? 'checked' : ''}> Kalın</label>
        <p class="mk__hint">Yazıyı önizlemede sürükleyerek taşı.</p>
      </section>
      <section><h4>Hareket</h4><div class="mk__chips mk__chips--sm">${chips('motion', MOTIONS, S.motion)}</div>
        ${range('speed', 'Hız', 0.5, 2, 0.1)}
        <p class="mk__hint">Hareket seçersen duvar kağıdın ${LOOP} saniyelik, sonsuz dönen bir video olur.</p>
      </section>
      <section class="mk__out">
        <button type="button" class="btn btn--primary" data-act="png">⬇ Resim olarak indir</button>
        <button type="button" class="btn" data-act="video">🎬 Hareketli indir (video)</button>
        ${helper ? `<div class="mk__row"><button type="button" class="btn" data-act="apply">🖥 Masaüstüne uygula</button><button type="button" class="btn" data-act="applylive">▶ Hareketli uygula</button></div>` : ''}
        <p class="mk__hint" id="mkStatus"></p>
      </section>`;
  }
  function syncShow() {
    box.querySelectorAll('[data-show]').forEach((n) => { n.hidden = !n.dataset.show.split(' ').includes(S.bg); });
    box.querySelectorAll('[data-act="video"], [data-act="applylive"]').forEach((b) => (b.disabled = S.motion === 'none'));
  }
  function rerender() { $('.mk__panel', box).innerHTML = panel(); syncShow(); }
  const status = (m) => { const s = $('#mkStatus', box); if (s) s.textContent = m || ''; };

  function build() {
    box = document.createElement('div');
    box.className = 'mk'; box.hidden = true;
    box.innerHTML = `
      <div class="mk__backdrop" data-mclose></div>
      <div class="mk__win" role="dialog" aria-modal="true" aria-label="Duvar kağıdı oluştur">
        <div class="mk__head"><div><p class="eyebrow">Oluştur</p><h3>Kendi duvar kağıdını yap</h3></div><button class="pfp__close" data-mclose aria-label="Kapat">✕</button></div>
        <div class="mk__body"><div class="mk__stage"><canvas></canvas><div class="mk__busy" hidden><span></span>Yapay zeka çiziyor…</div></div><div class="mk__panel"></div></div>
      </div>`;
    document.body.append(box);
    cv = $('canvas', box); ctx = cv.getContext('2d');
    const p = $('.mk__panel', box);
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-mclose]')) return close();
      const b = e.target.closest('button'); if (!b || !p.contains(b)) return;
      const d = b.dataset;
      if (d.size) { S.size = d.size; rerender(); fit(); return; }
      if (d.bg) { S.bg = d.bg; if ((d.bg === 'photo' || d.bg === 'ai') && S.imgSrc !== d.bg) S.img = null; rerender(); changed(); draw(); if (d.bg === 'ai' && !S.img) $('#mkPrompt', box)?.focus(); return; }
      if (d.pal) { S.colors = PALETTES[+d.pal].slice(); rerender(); draw(); return; }
      if (d.style !== undefined) { S.style = d.style; p.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('is-active', x === b)); return; }
      if (d.font) { S.font = d.font; p.querySelectorAll('[data-font]').forEach((x) => x.classList.toggle('is-active', x === b)); draw(); return; }
      if (d.motion) { S.motion = d.motion; p.querySelectorAll('[data-motion]').forEach((x) => x.classList.toggle('is-active', x === b)); syncShow(); t0 = performance.now(); changed(); draw(); return; }
      if (d.act === 'random') { const r = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); S.colors = [r(), r(), '#' + Math.floor(Math.random() * 0x202020).toString(16).padStart(6, '0')]; S.angle = Math.floor(Math.random() * 360); rerender(); draw(); }
      else if (d.act === 'reseed') { S.seed = Math.floor(Math.random() * 1e6); draw(); }
      else if (d.act === 'ai') genAI();
      else if (d.act === 'png') exportPng('download');
      else if (d.act === 'apply') exportPng('apply');
      else if (d.act === 'video') exportVideo('download');
      else if (d.act === 'applylive') exportVideo('apply');
    });
    p.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.color) { S.colors[+el.dataset.color] = el.value; draw(); return; }
      if (el.id === 'mkPrompt') { S.prompt = el.value; return; }
      const k = el.dataset.k; if (!k) return;
      S[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (k === 'imgZoom') p.querySelectorAll('[data-k="imgZoom"]').forEach((x) => (x.value = el.value));
      draw();
    });
    p.addEventListener('change', (e) => {
      if (e.target.type !== 'file' || !e.target.files[0]) return;
      const im = new Image();
      im.onload = () => { S.img = im; S.imgSrc = 'photo'; S.imgZoom = 1; S.imgX = S.imgY = 0.5; draw(); };
      im.src = URL.createObjectURL(e.target.files[0]);
    });
    // drag: the text if you grab it, otherwise the photo
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const nearText = S.text.trim() && Math.abs(x - S.tx) < 0.3 && Math.abs(y - S.ty) < 0.12;
      drag = { text: nearText, x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty, ix: S.imgX, iy: S.imgY, w: r.width, h: r.height };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / drag.w, dy = (e.clientY - drag.y) / drag.h;
      if (drag.text) { S.tx = Math.min(0.98, Math.max(0.02, drag.tx + dx)); S.ty = Math.min(0.98, Math.max(0.02, drag.ty + dy)); }
      else if (S.img) { S.imgX = Math.min(1, Math.max(0, drag.ix - dx * 1.5)); S.imgY = Math.min(1, Math.max(0, drag.iy - dy * 1.5)); }
      draw();
    });
    const end = () => (drag = null);
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    addEventListener('resize', () => { if (!box.hidden) fit(); });
    document.addEventListener('keydown', (e) => { if (!box.hidden && e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }, true);
  }

  // ---------- AI ----------
  function genAI() {
    const ta = $('#mkPrompt', box), text = (ta ? ta.value : S.prompt).trim();
    S.prompt = text;
    if (!text) { status('Önce ne istediğini yaz.'); ta?.focus(); return; }
    if (BLOCK.test(text)) { status('Bu istek oluşturulamaz: telifli karakterler ve uygunsuz içerik yasak. Özgün bir şey dene (örn. "soytarı maskeli gizemli bir karakter").'); return; }
    const wait = Math.ceil((aiReady - Date.now()) / 1000);
    if (aiBusy) return;
    if (wait > 0) { status(`Ücretsiz yapay zeka sırası: ${wait} saniye sonra tekrar dene.`); return; }
    const [W, H] = sizeOf(), k = Math.min(1, 1920 / Math.max(W, H));
    const w = Math.round(W * k), h = Math.round(H * k / 0.92), seed = Math.floor(Math.random() * 1e9);   // a bit taller: the bottom strip is cut off
    const full = `${text}${S.style ? ', ' + S.style : ''}, wallpaper, high quality, no text, no watermark, original character`;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&seed=${seed}&nologo=true&safe=true&model=flux&referrer=vexwalls.github.io`;
    aiBusy = true; $('.mk__busy', box).hidden = false; status('');
    const im = new Image(); im.crossOrigin = 'anonymous';
    const done = (ok) => { aiBusy = false; aiReady = Date.now() + 15000; $('.mk__busy', box).hidden = true; if (!ok) status('Yapay zeka şu an cevap vermedi. Birkaç saniye sonra tekrar dene.'); };
    const timer = setTimeout(() => { im.src = ''; done(false); }, 90000);
    im.onload = () => { clearTimeout(timer); S.img = im; S.imgSrc = 'ai'; S.imgZoom = 1; S.imgX = S.imgY = 0.5; done(true); status('Hazır! Beğenmediysen tekrar "Oluştur"a bas, her seferinde farklı çıkar.'); draw(); };
    im.onerror = () => { clearTimeout(timer); done(false); };
    im.src = url;
  }

  // ---------- export ----------
  function fullCanvas() { const [W, H] = sizeOf(), c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  function saveBlob(b, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function sendHelper(path, blob) {
    const base = window.CryWall.helperBase() || '';
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  function exportPng(mode) {
    const c = fullCanvas();
    try { render(c.getContext('2d'), c.width, c.height, 0); } catch { return status('Bu görsel dışa aktarılamıyor.'); }
    try { c.toBlob(async (b) => {
      if (!b) return status('Resim oluşturulamadı (görsel çok büyük olabilir, daha küçük bir boyut seç).');
      const name = `vexwalls-${c.width}x${c.height}.png`;
      if (mode === 'apply') {
        status('Uygulanıyor…');
        try { await sendHelper('/api/upload/apply?target=desktop', b); status('Masaüstüne uygulandı ✓ (Resimler › VexWalls klasörüne de kaydedildi)'); }
        catch (e) { status('Uygulanamadı: ' + e.message); }
        return;
      }
      const file = new File([b], name, { type: 'image/png' });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      saveBlob(b, name); status(`İndirildi: ${c.width}×${c.height} PNG`);
    }, 'image/png'); } catch { status('Bu görsel dışa aktarılamıyor.'); }
  }
  function pickType() {
    const types = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
  }
  async function exportVideo(mode) {
    if (S.motion === 'none') return status('Önce bir hareket seç.');
    const type = pickType();
    if (!type) return status('Bu tarayıcı video kaydedemiyor. Chrome ya da Edge ile dene.');
    if (mode === 'apply' && !type.startsWith('video/mp4')) return status('Masaüstüne hareketli uygulamak için MP4 gerekir; Edge ya da Chrome ile dene.');
    const [W0, H0] = sizeOf(), k = Math.min(1, 1920 / Math.max(W0, H0));      // video: up to 1920 px (smooth and small)
    const c = document.createElement('canvas'); c.width = Math.round(W0 * k / 2) * 2; c.height = Math.round(H0 * k / 2) * 2;
    const g = c.getContext('2d');
    try { render(g, c.width, c.height, 0); } catch { return status('Bu görsel dışa aktarılamıyor.'); }
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
    const parts = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const btns = box.querySelectorAll('.mk__out button'); btns.forEach((b) => (b.disabled = true));
    const dur = LOOP / S.speed;
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start(500);
    const start = performance.now();
    await new Promise((res) => {
      const step = () => {
        const el = (performance.now() - start) / 1000;
        render(g, c.width, c.height, Math.min(el, dur) * S.speed % LOOP);
        status(`Video hazırlanıyor… %${Math.min(99, Math.round((el / dur) * 100))} (sekmeyi kapatma)`);
        if (el >= dur) return res();
        requestAnimationFrame(step);
      };
      step();
    });
    rec.stop(); await stopped;
    btns.forEach((b) => (b.disabled = false)); syncShow();
    const blob = new Blob(parts, { type: type.split(';')[0] });
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    if (mode === 'apply') {
      status('Masaüstüne gönderiliyor…');
      try { await sendHelper('/api/upload/live', blob); status('Hareketli duvar kağıdın masaüstünde ✓'); } catch (e) { status('Uygulanamadı: ' + e.message); }
      return;
    }
    saveBlob(blob, `vexwalls-hareketli.${ext}`);
    status(`İndirildi: ${ext.toUpperCase()} video, ${Math.round(dur)} sn döngü. Telefonda "Video Live Wallpaper" gibi bir uygulamayla duvar kağıdı yapabilirsin.`);
  }

  // ---------- open / close ----------
  function open(opts = {}) {
    if (!box) build();
    if (opts.src) {    // "Bunu düzenle" from a wallpaper: start from that picture
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { S.img = im; S.imgSrc = 'photo'; S.bg = 'photo'; S.imgZoom = 1; S.imgX = S.imgY = 0.5; rerender(); draw(); };
      im.src = opts.src;
    }
    rerender();
    box.hidden = false; document.body.style.overflow = 'hidden';
    if (!history.state || !history.state.maker) history.pushState({ ...(history.state || {}), maker: true }, '');
    requestAnimationFrame(() => { fit(); t0 = performance.now(); loop(); });
  }
  function close(fromHistory = false) {
    if (!box || box.hidden) return;
    box.hidden = true; cancelAnimationFrame(raf); raf = 0;
    if (!document.querySelector('#viewer:not([hidden])')) document.body.style.overflow = '';
    if (!fromHistory && history.state && history.state.maker) { const s = { ...history.state }; delete s.maker; history.replaceState(s, ''); }
  }
  window.CWMaker = { open, close, isOpen: () => !!box && !box.hidden };
})();
