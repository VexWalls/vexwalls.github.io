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
  const MOTIONS = [['none', 'Yok'], ['zoom', 'Sinematik yakınlaşma'], ['pan', 'Yavaş kayma'], ['drift', 'Süzülme']];
  const FXS = [['fog', 'Sis'], ['rain', 'Yağmur'], ['snow', 'Kar'], ['dust', 'Işık zerreleri'], ['rays', 'Işık huzmeleri'], ['stars', 'Yıldız ışıltısı']];
  const FONTS = [['Plus Jakarta Sans', 'Yumuşak'], ['Space Grotesk', 'Modern'], ['Inter', 'Sade'], ['Georgia', 'Klasik'], ['Courier New', 'Daktilo'], ['Impact', 'Kalın']];
  // never sent to the AI: franchise characters / adult content (same idea as the site's filter)
  const BLOCK = /\b(joker|batman|shaco|league of legends|lol|pokemon|pikachu|naruto|goku|marvel|spider-?man|disney|mickey|elsa|harry potter|star wars|mario|sonic|genshin|valorant|fortnite|minecraft|nude|naked|nsfw|sex|porn|çıplak|ciplak|seks|erotik|gore)\b/i;

  const S = {
    size: 'screen', bg: 'gradient', colors: PALETTES[2].slice(), angle: 135, seed: 7, solid: '#101320',
    img: null, imgZoom: 1, imgX: 0.5, imgY: 0.5,
    blur: 0, bright: 100, sat: 100, grain: 0, vignette: 30, dark: 0,
    text: '', font: 'Plus Jakarta Sans', textSize: 90, textColor: '#ffffff', glow: true, tx: 0.5, ty: 0.5, bold: true,
    motion: 'none', camAmt: 8, camSpeed: 1, style: '', prompt: '',
    contrast: 100, hue: 0, temp: 0,
    loop: 10, fps: 30, q: 'high',
    // atmosphere layers (several can be on at once); amt/size/op in %, speed = cycles per loop, dir = wind in degrees
    fx: {
      fog:   { on: false, amt: 100, size: 100, speed: 1, dir: 0, op: 100, color: '#ffffff' },
      rain:  { on: false, amt: 100, size: 100, speed: 1, dir: 8, op: 100, color: '#cddcf0' },
      snow:  { on: false, amt: 100, size: 100, speed: 1, dir: 0, op: 100, color: '#ffffff' },
      dust:  { on: false, amt: 100, size: 100, speed: 1, dir: 0, op: 100, color: '#ffe6b4' },
      rays:  { on: false, amt: 100, size: 100, speed: 1, dir: 0, op: 100, color: '#fff0d2' },
      stars: { on: false, amt: 100, size: 100, speed: 1, dir: 0, op: 100, color: '#ffffff' },
    },
  };
  // address of our AI service (worker/ai.js on Cloudflare); empty = AI not set up yet
  const AI_URL = 'https://vexwalls-ai.yigithantalhas.workers.dev/';
  const FX_DEFAULT = JSON.parse(JSON.stringify(S.fx));
  const animated = () => S.motion !== 'none' || Object.values(S.fx).some((f) => f.on);
  let box, cv, ctx, raf = 0, t0 = performance.now(), grainTile = null, aiBusy = false, aiReady = 0;

  // ---------- tiny deterministic random ----------
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }
  function particles(n, seed) { const r = rng(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: r(), p: r(), k: r() })); }
  let PARTS = particles(140, 3);

  const sizeOf = () => { const z = SIZES.find((x) => x[0] === S.size) || SIZES[1]; return [z[2], z[3]]; };

  // ---------- drawing ----------
  function drawBackground(c, W, H, t) {
    const ph = (2 * Math.PI * t) / S.loop;
    if (S.bg === 'gradient') {
      const a = (S.angle + (S.motion !== 'none' ? Math.sin(ph * S.camSpeed) * S.camAmt * 3 : 0)) * Math.PI / 180;   // colours drift with the camera
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
        const mv = S.motion !== 'none' ? S.camAmt / 100 : 0.015;
        const x = (bx + Math.cos(ph + i) * mv) * W, y = (by + Math.sin(ph * (i % 2 ? 1 : -1) + i) * mv) * H;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      c.globalCompositeOperation = 'source-over';
    } else if (S.bg === 'solid') {
      c.fillStyle = S.solid; c.fillRect(0, 0, W, H);
    } else if (S.img) {
      const iw = S.img.naturalWidth, ih = S.img.naturalHeight;
      let z = S.imgZoom;
      const amt = S.camAmt / 100, cph = ph * S.camSpeed;             // camera: strength and speed (whole cycles: seamless loop)
      if (S.motion === 'zoom') z *= 1 + amt * (0.5 - 0.5 * Math.cos(cph));      // slow push-in and back, eased
      if (S.motion === 'pan' || S.motion === 'drift') z *= 1 + amt * 1.2;      // a little room to glide
      const sc = Math.max(W / iw, H / ih) * z, dw = iw * sc, dh = ih * sc;
      let fx = S.imgX, fy = S.imgY;
      if (S.motion === 'pan') { fx = 0.5 + Math.sin(cph) * 0.45; fy = 0.5 + Math.sin(cph * 2) * 0.1; }
      if (S.motion === 'drift') { fx = 0.5 + Math.sin(cph) * 0.35; fy = 0.5 + Math.cos(cph) * 0.35; }
      const dx = (W - dw) * fx, dy = (H - dh) * fy;
      c.drawImage(S.img, 0, 0, iw, ih, dx, dy, dw, dh);
    } else {
      // no picture yet: a soft placeholder that says what to do (instead of a black box)
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#26ccea';
      c.fillStyle = '#0b0d14'; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
      g.addColorStop(0, acc + '40'); g.addColorStop(1, acc + '00');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const fs = Math.min(W, H) / 22;
      c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${fs * 1.6}px "Plus Jakarta Sans", sans-serif`;
      c.fillText(S.bg === 'ai' ? '✨' : '📁', W / 2, H / 2 - fs * 1.6);
      c.font = `600 ${fs}px "Plus Jakarta Sans", sans-serif`;
      c.fillText(S.bg === 'ai' ? 'Sağda ne istediğini yaz ve "Oluştur"a bas' : 'Sağdan bir fotoğraf seç', W / 2, H / 2 + fs * 0.4);
      c.fillStyle = 'rgba(255,255,255,.45)'; c.font = `500 ${fs * 0.62}px "Plus Jakarta Sans", sans-serif`;
      c.fillText(S.bg === 'ai' ? 'Yapay zeka resmini burada çizecek' : 'Fotoğrafın bilgisayarından çıkmaz', W / 2, H / 2 + fs * 1.6);
    }
  }

  // ---------- motion effects: subtle, layered, out-of-focus (no cartoon shapes) ----------
  // Everything is periodic in S.loop seconds (integer cycles), so the exported video loops seamlessly.
  let SPRITE = null, FOG = null;
  function sprite() {        // soft round light, drawn scaled (looks like an out-of-focus flake / mote)
    if (!SPRITE) {
      SPRITE = document.createElement('canvas'); SPRITE.width = SPRITE.height = 64;
      const g = SPRITE.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }
    return SPRITE;
  }
  function fogTex() {        // seamless (left/right) soft cloud texture
    if (!FOG) {
      FOG = document.createElement('canvas'); FOG.width = 1024; FOG.height = 512;
      const g = FOG.getContext('2d'), r = rng(42);
      for (let i = 0; i < 70; i++) {
        const x = r() * 1024, y = 120 + r() * 300, rad = 60 + r() * 170, a = 0.035 + r() * 0.07;
        [x - 1024, x, x + 1024].forEach((xx) => {
          const gr = g.createRadialGradient(xx, y, 0, xx, y, rad);
          gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(xx - rad, y - rad, rad * 2, rad * 2);
        });
      }
    }
    return FOG;
  }
  // big particle pools; "Yoğunluk" uses a part of them (up to 3x the normal amount)
  const LAYERS = { snow: [particles(660, 11), particles(270, 12), particles(48, 13)], rain: [particles(960, 21), particles(210, 22)], dust: [particles(210, 31)], stars: [particles(480, 41)] };
  const TAU = Math.PI * 2;
  const tinted = {};                     // coloured copies of the soft sprite
  function spriteOf(col) {
    if (!tinted[col]) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.drawImage(sprite(), 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64);
      tinted[col] = c;
    }
    return tinted[col];
  }
  const take = (arr, base, amt) => arr.slice(0, Math.min(arr.length, Math.round(base * amt / 100)));
  const cycles = (base, sp) => Math.max(1, Math.round(base * sp));        // whole cycles per loop → seamless video
  function drawParticles(c, W, H, t) {
    const u = Math.min(W, H) / 1080, ph = t / S.loop, F = S.fx;
    c.save();
    if (F.fog.on) {
      const f = fogTex(), o = F.fog, sz = o.size / 100;
      c.globalCompositeOperation = 'screen';
      const fogC = o.color.toLowerCase();
      [[1, 0.55, 0.45, 1], [-1, 0.75, 0.6, 1.4]].forEach(([dir, a, top, scale]) => {
        const tw = W * scale * sz, th = H * 0.75 * scale * sz, n = cycles(1, o.speed) * (o.dir < 0 ? -1 : 1);
        const off = ((dir * n * ph * tw) % tw + tw) % tw;
        c.globalAlpha = Math.min(1, a * (o.amt / 100)) * (o.op / 100);
        for (let x = off - tw; x < W; x += tw) c.drawImage(f, x, H * top - th * 0.25, tw, th);
      });
      if (fogC !== '#ffffff') { c.globalCompositeOperation = 'color'; c.globalAlpha = 0.25 * o.op / 100; c.fillStyle = fogC; c.fillRect(0, H * 0.3, W, H * 0.7); }
      c.globalCompositeOperation = 'source-over';
    }
    if (F.rain.on) {
      const o = F.rain, wind = Math.tan(o.dir * Math.PI / 180);
      c.globalAlpha = 0.18 * o.op / 100; c.fillStyle = 'rgb(12,20,34)'; c.fillRect(0, 0, W, H);      // wet, cooler light
      [[12, 22, 0.13, 0.8, 14, 320], [45, 80, 0.2, 1.4, 20, 70]].forEach(([l0, l1, a, lw, speed, base], L) => {
        c.strokeStyle = o.color; c.lineWidth = lw * u * Math.sqrt(o.size / 100); c.lineCap = 'round';
        const n = cycles(speed, o.speed);
        c.beginPath();
        take(LAYERS.rain[L], base, o.amt).forEach((p) => {
          const len = (l0 + p.s * (l1 - l0)) * u * (o.size / 100), prog = (p.y + ph * n) % 1;
          const y = prog * (H + len * 2) - len, x = (p.x + wind * prog * H / W) * W;     // wind: slanted fall, still loops
          c.moveTo(x, y); c.lineTo(x - len * wind, y + len);
        });
        c.globalAlpha = a * o.op / 100; c.stroke();
      });
    }
    if (F.snow.on) {
      const o = F.snow, wind = Math.tan(o.dir * Math.PI / 180), sp = spriteOf(o.color);
      // far: tiny & faint, mid: small, near: big, out of focus, fast (depth of field)
      [[0.7, 1.6, 0.55, 1, 0.006, 220], [2, 3.6, 0.8, 2, 0.012, 90], [10, 22, 0.28, 3, 0.03, 16]].forEach(([s0, s1, a, speed, sway, base], L) => {
        const n = cycles(speed, o.speed);
        take(LAYERS.snow[L], base, o.amt).forEach((p) => {
          const prog = (p.y + ph * n) % 1, y = prog * (H + 60) - 30;
          const x = (((p.x + wind * prog * H / W + Math.sin(TAU * (ph * (L + 1) + p.p)) * sway) % 1) + 1) % 1 * W;
          const s = (s0 + p.s * (s1 - s0)) * u * (o.size / 100);
          c.globalAlpha = a * (0.6 + p.k * 0.4) * o.op / 100; c.drawImage(sp, x - s, y - s, s * 2, s * 2);
        });
      });
    }
    if (F.dust.on) {
      const o = F.dust, sp = spriteOf(o.color), n = cycles(1, o.speed), wind = Math.tan(o.dir * Math.PI / 180);
      c.globalCompositeOperation = 'lighter';
      take(LAYERS.dust[0], 70, o.amt).forEach((p) => {
        const prog = (((p.y - ph * n) % 1) + 1) % 1, y = prog * H;
        const x = (((p.x + wind * (1 - prog) * H / W + Math.sin(TAU * (ph + p.p)) * 0.02) % 1) + 1) % 1 * W, s = (2 + p.s * 9) * u * (o.size / 100);
        c.globalAlpha = (0.12 + 0.4 * p.k) * (0.6 + 0.4 * Math.sin(TAU * (ph * 2 + p.p))) * o.op / 100;
        c.drawImage(sp, x - s, y - s, s * 2, s * 2);
      });
      c.globalCompositeOperation = 'source-over';
    }
    if (F.rays.on) {
      const o = F.rays, beams = Math.max(2, Math.round(6 * o.amt / 100)), rot = o.dir * Math.PI / 180, n = cycles(1, o.speed);
      c.globalCompositeOperation = 'screen';
      const ox = W * 0.12, oy = -H * 0.15, len = Math.hypot(W, H) * 1.1;
      const rgb = o.color.match(/\w\w/g).map((h) => parseInt(h, 16)).join(',');
      for (let i = 0; i < beams; i++) {
        const ang = rot + 0.35 + i * (0.72 / beams) + Math.sin(TAU * ph * n + i) * 0.015, wdt = (0.035 + (i % 3) * 0.02) * (o.size / 100);
        const g = c.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
        g.addColorStop(0, `rgba(${rgb},.32)`); g.addColorStop(1, `rgba(${rgb},0)`);
        c.globalAlpha = (0.5 + 0.5 * Math.sin(TAU * (ph * n + i / beams))) * o.op / 100;
        c.fillStyle = g; c.beginPath(); c.moveTo(ox, oy);
        c.lineTo(ox + Math.cos(ang - wdt) * len, oy + Math.sin(ang - wdt) * len);
        c.lineTo(ox + Math.cos(ang + wdt) * len, oy + Math.sin(ang + wdt) * len); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    if (F.stars.on) {
      const o = F.stars, sp = spriteOf(o.color), n = cycles(1, o.speed);
      c.globalCompositeOperation = 'lighter';
      take(LAYERS.stars[0], 160, o.amt).forEach((p) => {
        const tw = 0.5 + 0.5 * Math.sin(TAU * (ph * n * (1 + Math.floor(p.s * 3)) + p.p)), s = (0.8 + p.k * 2.2) * u * (0.7 + tw * 0.6) * (o.size / 100);
        c.globalAlpha = (0.25 + 0.75 * tw) * o.op / 100; c.drawImage(sp, p.x * W - s * 2, p.y * H * 0.7 - s * 2, s * 4, s * 4);
      });
    }
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
    if (S.contrast !== 100) f.push(`contrast(${S.contrast}%)`);
    if (S.hue) f.push(`hue-rotate(${S.hue}deg)`);
    c.filter = f.length ? f.join(' ') : 'none';
    if (S.blur) { const p = S.blur * 2 * Math.min(W, H) / 1080; c.translate(-p, -p); c.scale((W + 2 * p) / W, (H + 2 * p) / H); }   // no faded edges
    drawBackground(c, W, H, t);
    c.restore();
    if (S.temp) {        // colour temperature: warm (orange) or cool (blue) light over the picture
      c.save(); c.globalCompositeOperation = 'soft-light'; c.globalAlpha = Math.abs(S.temp) / 100;
      c.fillStyle = S.temp > 0 ? '#ff8a1e' : '#1e78ff'; c.fillRect(0, 0, W, H); c.restore();
    }
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
  function draw() { if (cv) render(ctx, cv.width, cv.height, ((performance.now() - t0) / 1000) % S.loop); }
  function loop() { draw(); raf = animated() && !box.hidden ? requestAnimationFrame(loop) : 0; }
  function changed() { if (!raf) loop(); }

  // ---------- UI ----------
  const chips = (name, list, cur) => list.map(([k, n]) => `<button type="button" class="chip${k === cur ? ' is-active' : ''}" data-${name}="${k}">${n}</button>`).join('');
  const range = (k, label, min, max, step = 1) => `<label class="mk__range"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></label>`;
  // one atmosphere layer: on/off switch, and when on, all its settings
  const fxRange = (k, p, label, min, max, step = 1) => `<label class="mk__range"><span>${label}</span><input type="range" data-fx="${k}" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${S.fx[k][p]}"></label>`;
  function fxRow(k, name) {
    const o = S.fx[k];
    return `<div class="fxrow${o.on ? ' is-on' : ''}">
      <label class="fxrow__head"><span>${name}</span><input type="checkbox" class="mk__switch" data-fxon="${k}" ${o.on ? 'checked' : ''}></label>
      ${o.on ? `<div class="fxrow__body">
        ${fxRange(k, 'amt', k === 'rays' ? 'Huzme sayısı' : k === 'fog' ? 'Yoğunluk' : 'Miktar', 10, 300, 5)}
        ${fxRange(k, 'size', k === 'fog' ? 'Ölçek' : 'Boyut', 30, 300, 5)}
        ${fxRange(k, 'speed', 'Hız', 0.5, 4, 0.5)}
        ${fxRange(k, 'dir', k === 'rays' ? 'Açı' : 'Rüzgâr / yön', -45, 45, 1)}
        ${fxRange(k, 'op', 'Görünürlük', 5, 100, 1)}
        <div class="mk__row"><span class="mk__lbl">Renk</span><input type="color" data-fx="${k}" data-p="color" value="${o.color}" aria-label="${name} rengi"><button type="button" class="btn btn--sm" data-fxreset="${k}">Varsayılana dön</button></div>
      </div>` : ''}
    </div>`;
  }
  function panel() {
    const helper = window.CryWall && window.CryWall.helperBase && window.CryWall.helperBase() !== null;
    return `
      <section><h4>Boyut</h4><div class="mk__chips">${chips('size', SIZES.map((z) => [z[0], `${z[1]} <small>${z[2]}×${z[3]}</small>`]), S.size)}</div></section>
      <section><h4>Arka plan</h4><div class="mk__chips">${chips('bg', [['gradient', 'Renk geçişi'], ['aurora', 'Aurora'], ['solid', 'Düz renk'], ['photo', 'Fotoğrafım']], S.bg)}</div>
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
          <p class="mk__hint">Ücretsiz yapay zeka. Türkçe yazabilirsin; her seferinde farklı bir resim çıkar, 5–30 saniye sürer. Telifli karakterler (Joker, LoL, Pokémon…) ve uygunsuz içerik oluşturulamaz.</p>
          ${range('imgZoom', 'Yakınlaştır', 1, 3, 0.01)}
        </div>
      </section>
      <section><h4>Efektler</h4>
        ${range('blur', 'Bulanıklık', 0, 40)}${range('bright', 'Parlaklık', 40, 160)}${range('sat', 'Canlılık', 0, 200)}
        ${range('contrast', 'Kontrast', 50, 160)}${range('temp', 'Sıcaklık', -100, 100)}${range('hue', 'Renk tonu', -180, 180)}
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
      <section><h4>Kamera hareketi</h4><div class="mk__chips mk__chips--sm">${chips('motion', MOTIONS, S.motion)}</div>
        ${S.motion !== 'none' ? range('camAmt', 'Güç', 1, 25) + range('camSpeed', 'Hız', 1, 4, 1) : ''}
      </section>
      <section><h4>Atmosfer efektleri <small>(birden fazlasını aç)</small></h4>
        ${FXS.map(([k, n]) => fxRow(k, n)).join('')}
      </section>
      <section><h4>Video</h4>
        ${range('loop', 'Döngü (sn)', 6, 20, 1)}
        <div class="mk__row"><span class="mk__lbl">Akıcılık</span><div class="mk__chips mk__chips--sm">${chips('fps', [[24, '24 fps'], [30, '30 fps'], [60, '60 fps']], S.fps)}</div></div>
        <div class="mk__row"><span class="mk__lbl">Kalite</span><div class="mk__chips mk__chips--sm">${chips('q', [['normal', 'Normal'], ['high', 'Yüksek'], ['max', 'En yüksek']], S.q)}</div></div>
        <p class="mk__hint">Kamera hareketi ya da efekt açınca duvar kağıdın ${S.loop} saniyelik, dikişsiz dönen bir video olur.</p>
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
    box.querySelectorAll('[data-act="video"], [data-act="applylive"]').forEach((b) => (b.disabled = !animated()));
  }
  // filled part of each slider (CSS reads --p)
  const fillRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
  function rerender() { $('.mk__panel', box).innerHTML = panel(); syncShow(); box.querySelectorAll('input[type=range]').forEach(fillRange); }
  const status = (m) => { const s = $('#mkStatus', box); if (s) s.textContent = m || ''; };

  function build() {
    box = document.createElement('div');
    box.className = 'mk'; box.hidden = true;
    box.innerHTML = `
      <div class="mk__backdrop" data-mclose></div>
      <div class="mk__win" role="dialog" aria-modal="true" aria-label="Duvar kağıdı oluştur">
        <div class="mk__head"><div><p class="eyebrow">Oluştur</p><h3>Kendi duvar kağıdını yap</h3></div><button class="pfp__close" data-mclose aria-label="Kapat">✕</button></div>
        <div class="mk__body"><div class="mk__stage"><canvas></canvas><div class="mk__busy" hidden><div class="mk__think">
          <div class="mk__orb"><i></i><i></i><i></i></div>
          <b>Yapay zeka düşünüyor…</b>
          <p class="mk__prompt"></p>
          <ol class="mk__steps"><li>İsteğin anlaşılıyor</li><li>Türkçeden çevriliyor</li><li>Sahne ve ışık kuruluyor</li><li>Resim çiziliyor</li><li>Detaylar ve son rötuşlar</li></ol>
          <div class="mk__bar"><i></i></div>
        </div></div><div class="mk__note" hidden></div></div><div class="mk__panel"></div></div>
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
      if (d.motion) { S.motion = d.motion; rerender(); t0 = performance.now(); changed(); draw(); return; }
      if (d.fps) { S.fps = +d.fps; rerender(); return; }
      if (d.q) { S.q = d.q; rerender(); return; }
      if (d.fxreset) { S.fx[d.fxreset] = { ...FX_DEFAULT[d.fxreset], on: true }; rerender(); draw(); return; }
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
      if (el.type === 'range') fillRange(el);
      if (el.dataset.fx) {         // an atmosphere layer setting
        const o = S.fx[el.dataset.fx]; o[el.dataset.p] = el.type === 'color' ? el.value : +el.value; draw(); return;
      }
      if (el.dataset.fxon) { S.fx[el.dataset.fxon].on = el.checked; rerender(); t0 = performance.now(); changed(); draw(); return; }
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

  // ---------- AI (our Cloudflare Worker: worker/ai.js, free Workers AI) ----------
  const busyText = (m) => { const b = $('.mk__busy b', box); if (b) b.textContent = m; };
  // "thinking" screen: steps light up one by one and the bar fills while the picture is drawn
  let thinkTimer = 0;
  function think(on, prompt) {
    const el = $('.mk__busy', box), bar = $('.mk__bar i', box), steps = [...box.querySelectorAll('.mk__steps li')];
    clearInterval(thinkTimer);
    if (!on) {
      bar.style.width = '100%'; steps.forEach((s) => s.className = 'is-done');
      setTimeout(() => { el.hidden = true; el.classList.remove('is-on'); }, 450);
      return;
    }
    $('.mk__prompt', box).textContent = '“' + prompt + '”';
    busyText('Yapay zeka düşünüyor…');
    steps.forEach((s) => (s.className = '')); bar.style.width = '0%';
    el.hidden = false; requestAnimationFrame(() => el.classList.add('is-on'));
    const start = performance.now(), names = ['Yapay zeka düşünüyor…', 'İsteğini İngilizceye çeviriyor…', 'Sahneyi kuruyor…', 'Çiziyor…', 'Son rötuşları yapıyor…'];
    const tick = () => {
      const s = (performance.now() - start) / 1000;
      const i = Math.min(steps.length - 1, Math.floor(s / 2.4));
      steps.forEach((li, n) => (li.className = n < i ? 'is-done' : n === i ? 'is-now' : ''));
      busyText(names[i]);
      bar.style.width = (95 * (1 - Math.exp(-s / 6))).toFixed(1) + '%';   // slows down near the end, never "stuck at 100"
    };
    tick(); thinkTimer = setInterval(tick, 250);
  }
  // messages next to the picture too (the list on the right may be scrolled away)
  let noteTimer = 0;
  function note(m, bad) {
    const n = $('.mk__note', box); if (!n) return;
    n.textContent = m; n.classList.toggle('is-bad', !!bad); n.hidden = !m;
    clearTimeout(noteTimer); if (m) noteTimer = setTimeout(() => (n.hidden = true), 7000);
  }
  async function genAI() {
    const ta = $('#mkPrompt', box), text = (ta ? ta.value : S.prompt).trim();
    S.prompt = text;
    if (!text) { note('Önce sağdaki kutuya ne istediğini yaz.', true); ta?.focus(); return; }
    if (BLOCK.test(text)) { const m = 'Bu istek oluşturulamaz: telifli karakterler ve uygunsuz içerik yasak. Özgün bir şey dene (örn. "soytarı maskeli gizemli bir karakter").'; status(m); note(m, true); return; }
    if (aiBusy) return;
    if (!AI_URL) { status('Yapay zeka çok yakında geliyor.'); return; }
    const [W, H] = sizeOf(), k = Math.min(1, 1920 / Math.max(W, H));
    aiBusy = true; think(true, text); status(''); note('');
    let ok = false;
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
      let r;
      try {
        r = await fetch(AI_URL, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, style: S.style, width: Math.round(W * k), height: Math.round(H * k) }) });
      } finally { clearTimeout(timer); }
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) {
        const j = await r.json().catch(() => ({}));
        if (j.error === 'blocked') { const m = 'Bu istek oluşturulamaz: telifli karakterler ve uygunsuz içerik yasak.'; status(m); note(m, true); return; }
        if (j.error === 'quota') { const m = 'Bugünkü ücretsiz yapay zeka hakkı doldu. Yarın tekrar dene.'; status(m); note(m, true); return; }
        throw new Error(j.error || 'HTTP ' + r.status);
      }
      const im = new Image();
      const blob = await r.blob();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = URL.createObjectURL(blob); });
      S.img = im; S.imgSrc = 'ai'; S.imgZoom = 1; S.imgX = S.imgY = 0.5;
      if (S.bg !== 'ai') { S.bg = 'ai'; rerender(); }
      ok = true;
      think(false);
      // reveal: the new picture comes out of a blur
      cv.classList.remove('is-reveal'); void cv.offsetWidth; cv.classList.add('is-reveal');
      draw();
      status('Hazır! Beğenmediysen tekrar "Oluştur"a bas, her seferinde farklı çıkar. Yazı ya da hareket ekleyip indirebilirsin.');
      note('✨ Hazır! Yazı ya da hareket ekleyip indirebilirsin.');
    } catch (e) {
      const m = 'Yapay zeka şu an cevap vermedi. Biraz sonra tekrar dene.'; status(m); note(m, true);
    } finally {
      aiBusy = false;
      if (!ok) think(false);
    }
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
    if (!animated()) return status('Önce bir kamera hareketi ya da efekt aç.');
    const type = pickType();
    if (!type) return status('Bu tarayıcı video kaydedemiyor. Chrome ya da Edge ile dene.');
    if (mode === 'apply' && !type.startsWith('video/mp4')) return status('Masaüstüne hareketli uygulamak için MP4 gerekir; Edge ya da Chrome ile dene.');
    const [W0, H0] = sizeOf(), k = Math.min(1, 1920 / Math.max(W0, H0));      // video: up to 1920 px (smooth and small)
    const c = document.createElement('canvas'); c.width = Math.round(W0 * k / 2) * 2; c.height = Math.round(H0 * k / 2) * 2;
    const g = c.getContext('2d');
    try { render(g, c.width, c.height, 0); } catch { return status('Bu görsel dışa aktarılamıyor.'); }
    const stream = c.captureStream(S.fps);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: { normal: 6e6, high: 14e6, max: 28e6 }[S.q] || 14e6 });
    const parts = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const btns = box.querySelectorAll('.mk__out button'); btns.forEach((b) => (b.disabled = true));
    const dur = S.loop;
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start(500);
    const start = performance.now();
    await new Promise((res) => {
      const step = () => {
        const el = (performance.now() - start) / 1000;
        render(g, c.width, c.height, Math.min(el, dur) % S.loop);
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
    if (opts.motion) { S.motion = opts.motion; }   // "Hareketli yap" from an AI picture
    rerender();
    box.hidden = false; document.body.style.overflow = 'hidden';
    if (!history.state || !history.state.maker) history.pushState({ ...(history.state || {}), maker: true }, '');
    requestAnimationFrame(() => { fit(); t0 = performance.now(); loop(); if (opts.ai) genAI(); });
  }

  // ---------- home page AI box ----------
  function bindHome() {
    const form = document.getElementById('aiHomeForm'); if (!form) return;
    if (!AI_URL) { document.getElementById('aiHome').hidden = true; document.querySelectorAll('[data-aiscroll]').forEach((b) => (b.hidden = true)); return; }   // AI not set up yet
    const ta = document.getElementById('aiHomePrompt');
    let style = '';
    form.addEventListener('click', (e) => {
      const s = e.target.closest('[data-aistyle]');
      if (s) { style = s.dataset.aistyle; form.querySelectorAll('[data-aistyle]').forEach((x) => x.classList.toggle('is-active', x === s)); return; }
      const ex = e.target.closest('[data-aiex]');
      if (ex) { ta.value = ex.dataset.aiex; ta.focus(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) { ta.focus(); ta.classList.add('is-shake'); setTimeout(() => ta.classList.remove('is-shake'), 500); return; }
      open({ ai: text, style });
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    document.querySelectorAll('[data-aiscroll]').forEach((b) => b.addEventListener('click', () => {
      const top = document.getElementById('aiHome').getBoundingClientRect().top + scrollY - 90;
      (window.cwScrollTo ? window.cwScrollTo(top) : scrollTo(0, top));
      setTimeout(() => ta.focus({ preventScroll: true }), 600);
    }));
  }
  // (the home page AI box is run by ai.js now)
  function close(fromHistory = false) {
    if (!box || box.hidden) return;
    box.hidden = true; cancelAnimationFrame(raf); raf = 0;
    if (!document.querySelector('#viewer:not([hidden])')) document.body.style.overflow = '';
    if (!fromHistory && history.state && history.state.maker) { const s = { ...history.state }; delete s.maker; history.replaceState(s, ''); }
  }
  window.CWMaker = { open, close, isOpen: () => !!box && !box.hidden };
})();
