const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
];
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'HealthSphereAI/1.0 (family health platform; contact: demo@healthsphere.ai)',
  'Accept': 'application/json'
};

async function tryOnce(base, q) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const t0 = Date.now();
  try {
    const r = await fetch(base, { method: 'POST', headers: HEADERS, body: 'data=' + encodeURIComponent(q), signal: ctrl.signal });
    clearTimeout(t);
    console.log(base.slice(8, 32).padEnd(26), r.status, (Date.now() - t0) + 'ms');
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    clearTimeout(t);
    console.log(base.slice(8, 32).padEnd(26), 'ERR', e.message.slice(0, 50));
    return null;
  }
}

(async () => {
  const q = '[out:json][timeout:8];(node(around:6000,19.0596,72.8295)["amenity"="hospital"];way(around:6000,19.0596,72.8295)["amenity"="hospital"];);out center 40;';
  for (let round = 1; round <= 2 && !globalThis.found; round++) {
    for (const base of MIRRORS) {
      const d = await tryOnce(base, q);
      if (d?.elements?.length) {
        console.log('SUCCESS:', d.elements.length, 'hospitals near Bandra');
        for (const e of d.elements.slice(0, 8)) console.log(' -', e.tags?.name || '(unnamed)');
        globalThis.found = true;
        break;
      }
    }
  }
})();
