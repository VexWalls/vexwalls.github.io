/* VexWalls — AI wallpapers on the home page (like ChatGPT / Adobe Firefly).
 * Write what you want → the AI "thinks" → 3 different pictures are shown side by side.
 * Each one: view big, download, set as desktop (PC helper), profile picture, make it animated.
 * Pictures come from our Cloudflare Worker (worker/ai.js, free Workers AI). */
(function () {
  const AI_URL = 'https://vexwalls-ai.yigithantalhas.workers.dev/';
  const COUNT = 3;
  // anything the visitor imagines — except adult (+18) content and gore
  // (letter-aware word edges, so Turkish words like "çıplak" match too)
  const BLOCK = /(?<!\p{L})(nude|nudes|nudity|naked|nsfw|sex|sexy|sexual|porn|porno|hentai|erotic|erotica|lingerie|topless|bottomless|nipples?|genitals?|penis|vagina|boobs|breasts?|bdsm|fetish|onlyfans|strip ?tease|gore|gory|dismember\p{L}*|decapitat\p{L}*|beheaded|mutilat\p{L}*|disembowel\p{L}*|çıplak|ciplak|seks|seksi|sevişme|sevisme|erotik|müstehcen|mustehcen|iç ?çamaşırı|ic ?camasiri|göğüs|gogus|vahşet|vahset|kesik baş|kesik bas|parçalanmış|parcalanmis)(?!\p{L})/iu;
  const STEPS = ['İsteğini anlıyor…', 'İngilizceye çeviriyor…', 'Sahneyi ve ışığı kuruyor…', 'Çiziyor…', 'Son rötuşlar…'];
  // the 3 pictures differ on purpose (otherwise they can look alike)
  const VARIANTS = ['', ', different composition, wide view', ', alternative color palette, close-up details'];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let style = '', busy = false, batchNo = 0;

  const portrait = () => innerHeight > innerWidth * 1.1;
  const helper = () => window.CryWall && window.CryWall.helperBase && window.CryWall.helperBase() !== null;
  const toast = (a, b, t) => window.CryWall && window.CryWall.toast ? window.CryWall.toast(a, b, t) : null;

  // ---------- one picture ----------
  async function draw(prompt, variant) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(AI_URL, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: style + variant, width: portrait() ? 1080 : 1920, height: portrait() ? 1920 : 1080 }),
      });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'HTTP ' + r.status);
      }
      return await r.blob();
    } finally { clearTimeout(timer); }
  }

  // ---------- a batch of 3 ----------
  function card(i) {
    const c = document.createElement('div');
    c.className = 'aicard is-thinking';
    c.innerHTML = `
      <div class="aicard__think"><div class="aicard__orb"><i></i><i></i><i></i></div><b>${STEPS[0]}</b><div class="aicard__bar"><i></i></div></div>
      <img alt="Yapay zeka duvar kağıdı ${i + 1}">
      <div class="aicard__acts">
        <button type="button" data-a="view" title="Büyüt">⤢</button>
        <button type="button" data-a="dl">⬇ İndir</button>
        ${helper() ? '<button type="button" data-a="apply">🖥 Uygula</button>' : ''}
        <button type="button" data-a="pfp">👤 Profil</button>
        <button type="button" data-a="live">🎬 Hareketli</button>
      </div>`;
    return c;
  }
  function thinking(c) {
    const start = performance.now(), b = $('.aicard__think b', c), bar = $('.aicard__bar i', c);
    const off = Math.random() * 0.8;
    const t = setInterval(() => {
      const s = (performance.now() - start) / 1000 + off;
      b.textContent = STEPS[Math.min(STEPS.length - 1, Math.floor(s / 2.3))];
      bar.style.width = (95 * (1 - Math.exp(-s / 6))).toFixed(1) + '%';
    }, 200);
    return () => clearInterval(t);
  }

  async function generate(prompt) {
    if (busy) return;
    const res = $('#aiResults');
    busy = true; $('#aiHomeForm .aihome__go').disabled = true;
    batchNo++;
    const batch = document.createElement('div');
    batch.className = 'aibatch';
    batch.innerHTML = `<div class="aibatch__head"><span class="aibatch__you">Sen</span><p>${esc(prompt)}</p>
      <button type="button" class="btn btn--sm" data-again>↻ 3 yeni tane daha</button></div><div class="aibatch__grid"></div>`;
    res.prepend(batch);
    res.hidden = false;
    const grid = $('.aibatch__grid', batch);
    grid.classList.toggle('is-tall', portrait());
    $('[data-again]', batch).onclick = () => generate(prompt);
    const cards = Array.from({ length: COUNT }, (_, i) => card(i));
    cards.forEach((c) => grid.append(c));
    if (batchNo === 1 || res.getBoundingClientRect().top > innerHeight * 0.6) {
      const top = res.getBoundingClientRect().top + scrollY - 90;
      (window.cwScrollTo ? window.cwScrollTo(top) : scrollTo(0, top));
    }
    let quota = false, blocked = false, okCount = 0;
    await Promise.all(cards.map(async (c, i) => {
      const stop = thinking(c);
      await new Promise((r) => setTimeout(r, i * 350));        // don't hit the service all at the same millisecond
      try {
        const blob = await draw(prompt, VARIANTS[i]);
        const url = URL.createObjectURL(blob);
        const img = $('img', c);
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
        c.dataset.url = url; c.dataset.type = blob.type;
        c.classList.remove('is-thinking'); c.classList.add('is-ready');
        okCount++;
      } catch (e) {
        if (/quota/.test(e.message)) quota = true;
        if (/blocked/.test(e.message)) blocked = true;
        c.classList.remove('is-thinking'); c.classList.add('is-failed'); c.dataset.err = e.message;
        $('.aicard__think', c).innerHTML = '<b>Bu çizilemedi</b><small>Tekrar dene</small>';
      } finally { stop(); }
    }));
    busy = false; $('#aiHomeForm .aihome__go').disabled = false;
    if (blocked) toast('Bu istek oluşturulamaz', '+18 ve vahşet içeren resimler yasak. Başka bir şey hayal et.', 'err');
    else if (quota) toast('Bugünkü ücretsiz yapay zeka hakkı doldu', 'Yarın tekrar dene.', 'err');
    else if (!okCount) toast('Yapay zeka şu an cevap vermedi', 'Biraz sonra tekrar dene.', 'err');
  }

  // ---------- actions ----------
  const fileName = (c) => `vexwalls-yapay-zeka-${Date.now() % 100000}.${/png/.test(c.dataset.type) ? 'png' : 'jpg'}`;
  async function act(a, c) {
    const url = c.dataset.url; if (!url) return;
    if (a === 'view') return view(c);
    if (a === 'dl') {
      const blob = await fetch(url).then((r) => r.blob());
      const file = new File([blob], fileName(c), { type: blob.type });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const l = document.createElement('a'); l.href = url; l.download = file.name; document.body.append(l); l.click(); l.remove();
      return toast('İndirildi', 'Duvar kağıdın hazır', 'ok');
    }
    if (a === 'apply') {
      const blob = await fetch(url).then((r) => r.blob());
      try {
        const r = await fetch((window.CryWall.helperBase() || '') + '/api/upload/apply?target=desktop', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
        const j = await r.json(); if (!j.ok) throw new Error(j.error);
        toast('Masaüstüne uygulandı', 'Resimler › VexWalls klasörüne de kaydedildi.', 'ok');
      } catch (e) { toast('Uygulanamadı', e.message, 'err'); }
      return;
    }
    if (a === 'pfp') return window.CWPfp && CWPfp.open(url, { id: 'ai' });
    if (a === 'live') return window.CWMaker && CWMaker.open({ src: url, motion: 'zoom' });
  }

  // big view: arrows walk through the pictures of the same batch
  let lb = null;
  function view(c) {
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'ailb'; lb.hidden = true;
      lb.innerHTML = `<div class="ailb__bg" data-x></div><img alt=""><button class="ailb__x" data-x aria-label="Kapat">✕</button>
        <button class="ailb__nav ailb__nav--p" data-step="-1" aria-label="Önceki">‹</button><button class="ailb__nav ailb__nav--n" data-step="1" aria-label="Sonraki">›</button>
        <div class="ailb__acts"></div>`;
      document.body.append(lb);
      lb.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) return (lb.hidden = true);
        const s = e.target.closest('[data-step]'); if (s) return show(+s.dataset.step);
        const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a, lb.cur);
      });
      document.addEventListener('keydown', (e) => {
        if (lb.hidden) return;
        if (e.key === 'Escape') lb.hidden = true; else if (e.key === 'ArrowLeft') show(-1); else if (e.key === 'ArrowRight') show(1);
      });
    }
    const show = (d) => {
      const list = [...lb.cur.parentNode.querySelectorAll('.aicard.is-ready')];
      const n = list[(list.indexOf(lb.cur) + d + list.length) % list.length]; if (n) set(n);
    };
    const set = (card) => {
      lb.cur = card; $('img', lb).src = card.dataset.url;
      $('.ailb__acts', lb).innerHTML = $('.aicard__acts', card).innerHTML.replace('<button type="button" data-a="view" title="Büyüt">⤢</button>', '');
    };
    set(c); lb.hidden = false;
  }

  // ---------- form ----------
  function bind() {
    const form = document.getElementById('aiHomeForm'); if (!form) return;
    const ta = document.getElementById('aiHomePrompt');
    form.addEventListener('click', (e) => {
      const s = e.target.closest('[data-aistyle]');
      if (s) { style = s.dataset.aistyle; form.querySelectorAll('[data-aistyle]').forEach((x) => x.classList.toggle('is-active', x === s)); return; }
      const ex = e.target.closest('[data-aiex]');
      if (ex) { ta.value = ex.dataset.aiex; ta.focus(); return; }
      if (e.target.closest('[data-design]')) window.CWMaker && CWMaker.open();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) { ta.focus(); ta.classList.add('is-shake'); setTimeout(() => ta.classList.remove('is-shake'), 500); return; }
      if (BLOCK.test(text)) return toast('Bu istek oluşturulamaz', '+18 ve vahşet içeren resimler yasak. Başka bir şey hayal et.', 'err');
      generate(text);
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    document.getElementById('aiResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); const c = e.target.closest('.aicard');
      if (b && c) return act(b.dataset.a, c);
      if (c && c.classList.contains('is-ready') && !e.target.closest('button')) view(c);
    });
    document.querySelectorAll('[data-aiscroll]').forEach((b) => b.addEventListener('click', focus));
  }
  function focus() {
    const top = document.getElementById('aiHome').getBoundingClientRect().top + scrollY - 90;
    (window.cwScrollTo ? window.cwScrollTo(top) : scrollTo(0, top));
    setTimeout(() => document.getElementById('aiHomePrompt').focus({ preventScroll: true }), 600);
  }
  window.CWAI = { focus, generate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
