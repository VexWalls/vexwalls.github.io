/* VexWalls — AI assistant: a small round button in the bottom-right corner (above "back to top").
 * Click → a small chat box opens; write anything → the AI draws 3 pictures right in the box.
 * Click a picture to see it big: download, set as desktop (PC helper), profile picture, animate.
 * Pictures come from our Cloudflare Worker (worker/ai.js, free Workers AI). */
(function () {
  const AI_URL = 'https://vexwalls-ai.yigithantalhas.workers.dev/';
  const COUNT = 3;
  // anything the visitor imagines — except adult (+18) content and gore
  // (letter-aware word edges, so Turkish words like "çıplak" match too)
  const BLOCK = /(?<!\p{L})(nude|nudes|nudity|naked|nsfw|sex|sexy|sexual|porn|porno|hentai|erotic|erotica|lingerie|topless|bottomless|nipples?|genitals?|penis|vagina|boobs|breasts?|bdsm|fetish|onlyfans|strip ?tease|gore|gory|dismember\p{L}*|decapitat\p{L}*|beheaded|mutilat\p{L}*|disembowel\p{L}*|çıplak|ciplak|seks|seksi|sevişme|sevisme|erotik|müstehcen|mustehcen|iç ?çamaşırı|ic ?camasiri|göğüs|gogus|vahşet|vahset|kesik baş|kesik bas|parçalanmış|parcalanmis)(?!\p{L})/iu;
  const STEPS = ['Düşünüyor…', 'Anlıyor…', 'Çiziyor…', 'Son rötuşlar…'];
  const VARIANTS = ['', ', different composition, wide view', ', alternative color palette, close-up details'];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const portrait = () => innerHeight > innerWidth * 1.1;
  const helper = () => window.CryWall && window.CryWall.helperBase && window.CryWall.helperBase() !== null;
  const toast = (a, b, t) => (window.CryWall && window.CryWall.toast ? window.CryWall.toast(a, b, t) : null);
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.9 4.6 4.6 1.9-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.9L12 2.5Zm6.5 11 .95 2.05 2.05.95-2.05.95-.95 2.05-.95-2.05-2.05-.95 2.05-.95.95-2.05ZM6 15l.75 1.75L8.5 17.5l-1.75.75L6 20l-.75-1.75L3.5 17.5l1.75-.75L6 15Z"/></svg>';
  let fab, pop, list, ta, go, lb = null, busy = false;

  // ---------- one picture ----------
  async function draw(prompt, variant) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(AI_URL, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: variant, width: portrait() ? 1080 : 1920, height: portrait() ? 1920 : 1080 }),
      });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'HTTP ' + r.status);
      }
      const blob = await r.blob();
      return r.headers.get('X-Source') === 'pollinations' ? await cropLogo(blob) : blob;
    } finally { clearTimeout(timer); }
  }
  // backup pictures carry a small logo in the bottom strip: cut that strip off
  async function cropLogo(blob) {
    try {
      const bmp = await createImageBitmap(blob), h = Math.round(bmp.height * 0.92);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, h, 0, 0, bmp.width, h);
      return await new Promise((res) => c.toBlob((b) => res(b || blob), 'image/jpeg', 0.95));
    } catch { return blob; }
  }

  function card() {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'aithumb is-thinking';
    c.innerHTML = '<span class="aithumb__spin"></span><img alt="">';
    return c;
  }

  async function generate(prompt) {
    if (busy) return;
    busy = true; go.disabled = true;
    const msg = document.createElement('div');
    msg.className = 'aimsg';
    msg.innerHTML = `<p class="aimsg__you">${esc(prompt)}</p><div class="aimsg__ai"><small>${STEPS[0]}</small><div class="aimsg__grid${portrait() ? ' is-tall' : ''}"></div></div>`;
    list.append(msg);
    list.scrollTop = list.scrollHeight;
    const grid = $('.aimsg__grid', msg), state = $('small', msg);
    const cards = Array.from({ length: COUNT }, () => card());
    cards.forEach((c) => grid.append(c));
    const t0 = performance.now();
    const tick = setInterval(() => { state.textContent = STEPS[Math.min(STEPS.length - 1, Math.floor((performance.now() - t0) / 2600))]; }, 300);
    let quota = false, blocked = false, ok = 0;
    await Promise.all(cards.map(async (c, i) => {
      await new Promise((r) => setTimeout(r, i * 350));
      try {
        const blob = await draw(prompt, VARIANTS[i]);
        const url = URL.createObjectURL(blob), img = $('img', c);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        c.dataset.url = url; c.dataset.type = blob.type;
        c.classList.remove('is-thinking'); c.classList.add('is-ready'); ok++;
        list.scrollTop = list.scrollHeight;
      } catch (e) {
        if (/quota/.test(e.message)) quota = true;
        if (/blocked/.test(e.message)) blocked = true;
        c.remove();
      }
    }));
    clearInterval(tick);
    busy = false; go.disabled = false;
    if (ok) state.textContent = 'Beğendiğine tıkla: büyüt, indir, uygula.';
    else {
      state.textContent = blocked ? 'Bu isteğe izin verilmiyor.' : quota ? 'Bugünkü ücretsiz hak doldu, yarın tekrar dene.' : 'Şu an çizilemedi, biraz sonra tekrar dene.';
      state.classList.add('is-bad');
    }
    list.scrollTop = list.scrollHeight;
  }

  // ---------- ChatGPT: the request is written here, the picture is drawn there ----------
  function gptPrompt(text) {
    const tall = portrait();
    return `Bana şu isteğe göre bir ${tall ? 'telefon' : 'masaüstü'} duvar kağıdı resmi çiz: "${text}". ` +
      `${tall ? 'Dikey 9:16 (1080x1920)' : 'Yatay 16:9 (1920x1080)'}, yüksek çözünürlük, çok detaylı, etkileyici ışık ve renkler. Resmin üzerinde yazı veya filigran olmasın.`;
  }
  function openGPT(text) {
    const url = 'https://chatgpt.com/?q=' + encodeURIComponent(gptPrompt(text));
    const w = window.open(url, '_blank'); if (w) w.opener = null;
    const m = document.createElement('div'); m.className = 'aimsg';
    m.innerHTML = `<p class="aimsg__you">${esc(text)}</p><div class="aimsg__ai"><small>✓ İsteğin hazır. ChatGPT yeni sekmede ${w ? 'açıldı' : 'açılacak'}; resim orada çizilecek, beğenirsen oradan indir.</small>
      <a class="aimsg__open" href="${url}" target="_blank" rel="noopener">ChatGPT'yi aç ↗</a>
      ${dropHtml()}</div>`;
    list.append(m); list.scrollTop = list.scrollHeight;
  }

  // ---------- bring the ChatGPT picture back: drop / choose / paste ----------
  const dropHtml = () => `<label class="aidrop"><input type="file" accept="image/*" hidden>
      <b>ChatGPT'den indirdiğin resmi buraya bırak</b><span>ya da tıklayıp seç · ChatGPT'de "kopyala" deyip burada Ctrl+V</span></label>`;
  function addOwn(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const m = document.createElement('div'); m.className = 'aimsg';
    m.innerHTML = `<div class="aimsg__ai"><small>Resmin burada. Tıkla: indir, masaüstüne uygula, profil resmi, hareketli yap ya da yazı ekle.</small><div class="aimsg__grid aimsg__grid--one"></div></div>`;
    const c = card(); c.dataset.url = url; c.dataset.type = file.type;
    const img = $('img', c); img.onload = () => { c.classList.remove('is-thinking'); c.classList.add('is-ready'); c.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight; };
    img.src = url;
    $('.aimsg__grid', m).append(c);
    list.append(m); list.scrollTop = list.scrollHeight;
  }

  // ---------- actions on a picture ----------
  const fileName = (c) => `vexwalls-yapay-zeka-${Date.now() % 100000}.${/png/.test(c.dataset.type) ? 'png' : 'jpg'}`;
  async function act(a, c) {
    const url = c.dataset.url; if (!url) return;
    if (a === 'dl') {
      const blob = await fetch(url).then((r) => r.blob());
      const file = new File([blob], fileName(c), { type: blob.type });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const l = document.createElement('a'); l.href = url; l.download = file.name; document.body.append(l); l.click(); l.remove();
      return toast('İndirildi', '', 'ok');
    }
    if (a === 'apply') {
      const blob = await fetch(url).then((r) => r.blob());
      try {
        const r = await fetch((window.CryWall.helperBase() || '') + '/api/upload/apply?target=desktop', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
        const j = await r.json(); if (!j.ok) throw new Error(j.error);
        toast('Masaüstüne uygulandı', '', 'ok');
      } catch (e) { toast('Uygulanamadı', e.message, 'err'); }
      return;
    }
    if (a === 'edit') { lb.hidden = true; return window.CWMaker && CWMaker.open({ src: url }); }
    if (a === 'pfp') { lb.hidden = true; return window.CWPfp && CWPfp.open(url, { id: 'ai' }); }
    if (a === 'live') { lb.hidden = true; return window.CWMaker && CWMaker.open({ src: url, motion: 'zoom' }); }
  }

  // big view (arrows go through the pictures of the same answer)
  function lbSet(x) { lb.cur = x; $('img', lb).src = x.dataset.url; }
  function lbStep(d) {
    const all = [...lb.cur.parentNode.querySelectorAll('.aithumb.is-ready')];
    const n = all[(all.indexOf(lb.cur) + d + all.length) % all.length]; if (n) lbSet(n);
  }
  function view(c) {
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'ailb'; lb.hidden = true;
      lb.innerHTML = `<div class="ailb__bg" data-x></div><img alt=""><button class="ailb__x" data-x aria-label="Kapat">✕</button>
        <button class="ailb__nav ailb__nav--p" data-step="-1" aria-label="Önceki">‹</button><button class="ailb__nav ailb__nav--n" data-step="1" aria-label="Sonraki">›</button>
        <div class="ailb__acts">
          <button type="button" data-a="dl">İndir</button>
          ${helper() ? '<button type="button" data-a="apply">Masaüstüne uygula</button>' : ''}
          <button type="button" data-a="pfp">Profil resmi yap</button>
          <button type="button" data-a="live">Hareketli yap</button>
          <button type="button" data-a="edit">Yazı ekle / düzenle</button>
        </div>`;
      document.body.append(lb);
      lb.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) return (lb.hidden = true);
        const s = e.target.closest('[data-step]'); if (s) return lbStep(+s.dataset.step);
        const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a, lb.cur);
      });
      document.addEventListener('keydown', (e) => {
        if (lb.hidden) return;
        if (e.key === 'Escape') { e.stopImmediatePropagation(); lb.hidden = true; } else if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1);
      }, true);
    }
    lbSet(c); lb.hidden = false;
  }

  // ---------- the corner button + chat box ----------
  function build() {
    fab = document.createElement('button');
    fab.className = 'aifab'; fab.type = 'button'; fab.title = 'Yapay zekayla duvar kağıdı yap'; fab.setAttribute('aria-label', 'Yapay zeka');
    fab.innerHTML = ICON;
    pop = document.createElement('div');
    pop.className = 'aipop'; pop.hidden = true;
    pop.innerHTML = `
      <div class="aipop__head"><b>${ICON}Yapay zeka</b><button type="button" class="aipop__x" aria-label="Kapat">✕</button></div>
      <div class="aipop__list"><p class="aipop__hi">Ne istersen yaz. Resmin <b>ChatGPT</b>'de çizilir: isteğin hazır yazılmış olarak <b>yeni sekmede ChatGPT açılır</b>, resmi oradan indirirsin (ücretsiz ChatGPT hesabın yeter).</p>${dropHtml()}</div>
      <form class="aipop__form" autocomplete="off">
        <textarea rows="2" maxlength="300" placeholder="Hayal et ve yaz…"></textarea>
        <button class="btn btn--primary" type="submit">ChatGPT'de çiz ↗</button>
      </form>
      <button type="button" class="aipop__local">ya da burada hızlıca çiz (ücretsiz, daha düşük kalite)</button>`;
    document.body.append(fab, pop);
    list = $('.aipop__list', pop); ta = $('textarea', pop); go = $('button[type=submit]', pop);
    fab.onclick = () => toggle();
    $('.aipop__x', pop).onclick = () => toggle(false);
    // returns the request, or '' when it is empty / not allowed (then the box says why)
    const take = () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return ''; }
      ta.value = '';
      if (BLOCK.test(text)) {
        const m = document.createElement('div'); m.className = 'aimsg';
        m.innerHTML = `<p class="aimsg__you">${esc(text)}</p><div class="aimsg__ai"><small class="is-bad">Bu isteğe izin verilmiyor.</small></div>`;
        list.append(m); list.scrollTop = list.scrollHeight; return '';
      }
      return text;
    };
    $('form', pop).addEventListener('submit', (e) => {
      e.preventDefault();
      const text = take(); if (text) openGPT(text);
    });
    $('.aipop__local', pop).onclick = () => { const text = take(); if (text) generate(text); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form', pop).requestSubmit(); } });
    list.addEventListener('click', (e) => { const c = e.target.closest('.aithumb.is-ready'); if (c) view(c); });
    // own picture (from ChatGPT): choose, drop anywhere on the box, or paste
    pop.addEventListener('change', (e) => { if (e.target.type === 'file' && e.target.files[0]) { addOwn(e.target.files[0]); e.target.value = ''; } });
    pop.addEventListener('dragover', (e) => { e.preventDefault(); pop.classList.add('is-drag'); });
    pop.addEventListener('dragleave', (e) => { if (!pop.contains(e.relatedTarget)) pop.classList.remove('is-drag'); });
    pop.addEventListener('drop', (e) => { e.preventDefault(); pop.classList.remove('is-drag'); [...(e.dataTransfer.files || [])].forEach(addOwn); });
    pop.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData && e.clipboardData.files || [])].find((x) => /^image\//.test(x.type));
      if (f) { e.preventDefault(); addOwn(f); }
    });
    document.addEventListener('keydown', (e) => { if (!pop.hidden && e.key === 'Escape' && (!lb || lb.hidden)) toggle(false); });
  }
  function toggle(on = pop.hidden) {
    pop.hidden = !on; fab.classList.toggle('is-open', on);
    if (on) setTimeout(() => ta.focus(), 50);
  }
  window.CWAI = { focus: () => toggle(true), generate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
