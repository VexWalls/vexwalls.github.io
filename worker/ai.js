// VexWalls AI — Cloudflare Worker (free Workers AI).
// Paste this file into a Worker in the Cloudflare dashboard and add a "Workers AI" binding
// named AI (Settings › Bindings). The website sends { prompt, style, width, height } and gets
// back a JPEG/PNG picture. Turkish prompts are translated to English first (better results).
const ALLOWED = ['https://vexwalls.github.io', 'http://localhost:8790', 'http://127.0.0.1:8790'];
// Anything the visitor imagines is drawn — except adult (+18) content and gore.
const BLOCK = /(?<!\p{L})(nude|nudes|nudity|naked|nsfw|sex|sexy|sexual|porn|porno|hentai|erotic|erotica|lingerie|topless|bottomless|nipples?|genitals?|penis|vagina|boobs|breasts?|bdsm|fetish|onlyfans|strip ?tease|gore|gory|dismember\p{L}*|decapitat\p{L}*|beheaded|mutilat\p{L}*|disembowel\p{L}*|çıplak|ciplak|seks|seksi|sevişme|sevisme|erotik|müstehcen|mustehcen|iç ?çamaşırı|ic ?camasiri|göğüs|gogus|vahşet|vahset|kesik baş|kesik bas|parçalanmış|parcalanmis)(?!\p{L})/iu;
// Cheap models first: the free plan has a daily budget ("neurons"); Leonardo Lucid used it up
// after a handful of pictures. SDXL Lightning draws at its own 16:9 / 9:16 size (the site
// scales it to the screen), FLUX Schnell is the fallback.
const MODELS = [
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', native: true },
  { id: '@cf/black-forest-labs/flux-1-schnell', steps: 6 },
];

function cors(origin) {
  const ok = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return { 'Access-Control-Allow-Origin': ok, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const json = (o, status, h) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } });

// common Turkish search words (used when the translation model is not available)
const TR = { göz: 'eye', gözler: 'eyes', kedi: 'cat', kediler: 'cats', köpek: 'dog', dağ: 'mountain', dağlar: 'mountains', deniz: 'sea', okyanus: 'ocean', orman: 'forest', ağaç: 'tree', çiçek: 'flower', gece: 'night', gündüz: 'day', güneş: 'sun', ay: 'moon', yıldız: 'star', yıldızlar: 'stars', uzay: 'space', gezegen: 'planet', şehir: 'city', araba: 'car', arabalar: 'cars', yağmur: 'rain', kar: 'snow', kış: 'winter', yaz: 'summer', sonbahar: 'autumn', ilkbahar: 'spring', göl: 'lake', nehir: 'river', şelale: 'waterfall', kız: 'girl', erkek: 'man', kadın: 'woman', savaşçı: 'warrior', şövalye: 'knight', samuray: 'samurai', ejderha: 'dragon', kurt: 'wolf', aslan: 'lion', kaplan: 'tiger', kuş: 'bird', at: 'horse', balık: 'fish', kafatası: 'skull', iblis: 'demon', melek: 'angel', karanlık: 'dark', kırmızı: 'red', mavi: 'blue', yeşil: 'green', sarı: 'yellow', mor: 'purple', siyah: 'black', beyaz: 'white', turuncu: 'orange', pembe: 'pink', ateş: 'fire', su: 'water', buz: 'ice', bulut: 'clouds', gökyüzü: 'sky', sahil: 'beach', çöl: 'desert', kale: 'castle', robot: 'robot', oyun: 'video games', film: 'movies', dizi: 'tv series', anime: 'anime', karakter: 'character', palyaço: 'clown', soytarı: 'jester', maske: 'mask', kılıç: 'sword', motor: 'motorcycle', uçak: 'airplane', gemi: 'ship', tren: 'train', futbol: 'football', müzik: 'music', gitar: 'guitar', sanat: 'art', minimal: 'minimalism', soyut: 'abstract', neon: 'neon', japonya: 'Japan', türkiye: 'Turkey', istanbul: 'Istanbul' };
const trWords = (t) => t.split(/\s+/).map((w) => TR[w.toLocaleLowerCase('tr')] || w).join(' ');
async function toEnglish(env, text) {
  if (!/[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|ile|gibi|gece|deniz|dağ|orman|uzay|şehir|karanlık|kedi|köpek|araba|ev|ay|güneş|yağmur|kar)\b/i.test(text)) return text;
  try {
    const r = await env.AI.run('@cf/meta/m2m100-1.2b', { text, source_lang: 'turkish', target_lang: 'english' });
    return (r && r.translated_text) || trWords(text);
  } catch { return trWords(text); }
}

async function toImage(out) {
  // models answer either raw bytes / a stream, or { image: base64 }
  if (out && typeof out === 'object' && typeof out.image === 'string') {
    const bin = atob(out.image), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export default {
  async fetch(req, env) {
    const h = cors(req.headers.get('Origin') || '');
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    // Wallpaper search for the site: anything the visitor types (Wallhaven has no CORS, so we fetch it).
    // Safe-for-work only (purity=100); Turkish words are translated to English first.
    const u0 = new URL(req.url);
    if (req.method === 'GET' && u0.searchParams.has('search')) {
      const q = u0.searchParams.get('search').slice(0, 120).trim();
      if (!q || BLOCK.test(q)) return json({ data: [], blocked: !!q, meta: { total: 0, last_page: 1, current_page: 1 } }, 200, h);
      const en = await toEnglish(env, q);
      const p = new URLSearchParams({ q: en, purity: '100', categories: '111' });
      for (const k of ['page', 'sorting', 'topRange', 'atleast', 'ratios', 'colors', 'seed', 'order']) { const v = u0.searchParams.get(k); if (v) p.set(k, v.slice(0, 40)); }
      const r = await fetch('https://wallhaven.cc/api/v1/search?' + p, { headers: { 'User-Agent': 'VexWalls/1.0 (+https://vexwalls.github.io)' }, cf: { cacheTtl: 600, cacheEverything: true } });
      const body = await r.text();
      return new Response(body, { status: r.ok ? 200 : 502, headers: { ...h, 'Content-Type': 'application/json', 'X-Query': encodeURIComponent(en).slice(0, 300), 'Access-Control-Expose-Headers': 'X-Query' } });
    }
    if (req.method !== 'POST') return json({ ok: true, service: 'VexWalls AI' }, 200, h);
    if (!ALLOWED.includes(req.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, h);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400, h); }
    const prompt = String(body.prompt || '').slice(0, 300).trim();
    if (!prompt) return json({ error: 'empty' }, 400, h);
    if (BLOCK.test(prompt)) return json({ error: 'blocked' }, 400, h);
    const style = String(body.style || '').slice(0, 160);
    const W = Math.min(1920, Math.max(512, (body.width | 0) || 1920)), H = Math.min(1920, Math.max(512, (body.height | 0) || 1080));
    const en = await toEnglish(env, prompt);
    if (BLOCK.test(en)) return json({ error: 'blocked' }, 400, h);    // also after translation
    const full = `${en}${style ? ', ' + style : ''}, high quality wallpaper, highly detailed, sharp focus, safe for work, fully clothed, no text, no watermark`;
    let lastErr = '';
    for (const m of MODELS) {
      try {
        const input = { prompt: full };
        if (m.native) { const tall = H > W; input.width = tall ? 768 : 1344; input.height = tall ? 1344 : 768; input.num_steps = 8; }
        if (m.steps) input.steps = m.steps;
        const bytes = await toImage(await env.AI.run(m.id, input));
        if (bytes.length < 1000) throw new Error('empty image');
        const png = bytes[0] === 0x89;
        return new Response(bytes, { headers: { ...h, 'Content-Type': png ? 'image/png' : 'image/jpeg', 'X-Model': m.id, 'X-Prompt': encodeURIComponent(en).slice(0, 500) } });
      } catch (e) { lastErr = String(e && e.message || e); }
    }
    // Backup when the daily Workers AI budget is used up: Pollinations' free image API (FLUX).
    // It stamps a small logo bottom-right; the site cuts that strip off (X-Source header).
    try {
      const pw = W > H ? 1280 : 720, ph = Math.round((W > H ? 1280 * H / W : 720 * H / W) / 0.92);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${pw}&height=${ph}&seed=${Math.floor(Math.random() * 1e9)}&nologo=true&safe=true&model=flux`;
      const r = await fetch(url, { headers: { 'User-Agent': 'VexWalls/1.0 (+https://vexwalls.github.io)' } });
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) {
        return new Response(r.body, { headers: { ...h, 'Content-Type': r.headers.get('content-type'), 'X-Source': 'pollinations', 'Access-Control-Expose-Headers': 'X-Source' } });
      }
      lastErr += ' | backup ' + r.status;
    } catch (e) { lastErr += ' | backup ' + (e && e.message); }
    const quota = /limit|quota|neurons|429/i.test(lastErr);
    return json({ error: quota ? 'quota' : 'failed', detail: lastErr.slice(0, 200) }, quota ? 429 : 502, h);
  },
};
