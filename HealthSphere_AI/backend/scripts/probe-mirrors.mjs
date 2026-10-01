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

(async () => {
  const q = '[out:json][timeout:6];node(around:800,19.0596,72.8295)["amenity"="pharmacy"];out center 5;';
  for (const base of MIRRORS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const t0 = Date.now();
    try {
      const r = await fetch(base, { method: 'POST', headers: HEADERS, body: 'data=' + encodeURIComponent(q), signal: ctrl.signal });
      clearTimeout(t);
      let info = r.status;
      if (r.ok) { const d = await r.json(); info += ' n=' + d.elements.length; }
      else info += ' :: ' + (await r.text()).slice(0, 80).replace(/\n/g, ' ');
      console.log(base.slice(8, 34).padEnd(28), info, (Date.now() - t0) + 'ms');
    } catch (e) {
      clearTimeout(t);
      console.log(base.slice(8, 34).padEnd(28), 'ERR', e.name === 'AbortError' ? 'timeout/abort' : e.message.slice(0, 60));
    }
  }
})();
