const { JSDOM } = require('jsdom');

(async () => {
  const html = await (await fetch('http://localhost:3000/')).text();
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));

  // jsdom lacks fetch — bridge to node's fetch with a session cookie jar
  const jar = new Map();
  window.fetch = async (path, opts = {}) => {
    const url = new URL(path, 'http://localhost:3000').href;
    const headers = Object.assign({}, opts.headers || {});
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
    const res = await fetch(url, { ...opts, headers });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return res;
  };

  // load each script exactly like the browser does
  const scripts = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  for (const src of scripts) {
    const path = src.split('?')[0];
    const code = await (await fetch('http://localhost:3000' + path)).text();
    try { window.eval(code); } catch (e) { errors.push(`${path}: ${e.message}`); }
  }

  await new Promise(r => setTimeout(r, 1200)); // let async boot settle

  console.log('scripts loaded :', scripts.length);
  console.log('VIEWS registered:', Object.keys(window.VIEWS || {}).length);
  console.log('App exists      :', !!window.App);
  console.log('rendered #app   :', window.document.getElementById('app').innerHTML.slice(0, 120).replace(/\s+/g, ' '));
  console.log('boot errors     :', errors.length ? errors : 'NONE');

  // simulate clicking demo login and verify a REAL authenticated dashboard renders
  let loginOk = false;
  if (window.document.querySelector('#demo-btn')) {
    try { await window.document.querySelector('#demo-btn').onclick(); }
    catch (e) { errors.push('login: ' + e.message); }
    await new Promise(r => setTimeout(r, 1500));
    const view = window.document.getElementById('view');
    loginOk = !!window.App.user && !!view && /Key metric trends|hero/i.test(view.innerHTML);
    console.log('after demo-login click:', loginOk ? 'DASHBOARD RENDERED ✓' : 'LOGIN/DASHBOARD FAILED');
  }
  const realErrors = errors.filter(x => !/getContext/.test(x));
  if (realErrors.length || !loginOk) { console.log('FAILURES:', realErrors); process.exit(1); }
})().catch(e => { console.error('HARNESS FAIL:', e.message); process.exit(1); });
