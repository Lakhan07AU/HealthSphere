const BASE = 'http://localhost:3000';

async function main() {
  let r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@healthsphere.ai', password: 'demo1234' })
  });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  console.log('login:', r.status);

  async function nearby(label, params) {
    const t0 = Date.now();
    const res = await fetch(BASE + '/api/hospitals?' + params, { headers: { cookie } });
    const d = await res.json();
    console.log(`\n[${label}] ${res.status} source=${d.source} n=${d.facilities.length} ${Date.now() - t0}ms`);
    for (const f of d.facilities.slice(0, 4)) console.log('  -', f.name.slice(0, 42), '|', f.type, '|', f.distanceKm + 'km');
    return d;
  }

  // 1) cold live query
  await nearby('live coords #1 (cold)', 'lat=19.0596&lng=72.8295&type=all');
  // 2) cached repeat — should be instant
  await nearby('live coords #2 (cached)', 'lat=19.0596&lng=72.8295&type=all');
  // 3) different type filter, same area
  await nearby('pharmacy filter same area', 'lat=19.0596&lng=72.8295&type=pharmacy');
  // 4) place search (geocode + live)
  const p = await nearby('place search Koramangala', 'place=Koramangala, Bangalore&type=hospital');
  console.log('   origin:', p.origin?.lat?.toFixed?.(4), p.origin?.lng?.toFixed?.(4), '-', p.origin?.label);
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
