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
  return { 'Access-Control-Allow-Origin': ok, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const json = (o, status, h) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } });

async function toEnglish(env, text) {
  if (!/[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|ile|gibi|gece|deniz|dağ|orman|uzay|şehir|karanlık|kedi|köpek|araba|ev|ay|güneş|yağmur|kar)\b/i.test(text)) return text;
  try {
    const r = await env.AI.run('@cf/meta/m2m100-1.2b', { text, source_lang: 'turkish', target_lang: 'english' });
    return (r && r.translated_text) || text;
  } catch { return text; }
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
    const quota = /limit|quota|neurons|429/i.test(lastErr);
    return json({ error: quota ? 'quota' : 'failed', detail: lastErr.slice(0, 200) }, quota ? 429 : 502, h);
  },
};
