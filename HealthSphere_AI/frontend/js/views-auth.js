/* ---------- Auth views (login / register) ---------- */

const HERO_FEATURES = `
  <div class="feat">
    <div><b>Document intelligence</b><span>Lab reports become structured, trend-ready data.</span></div>
    <div><b>Longitudinal analysis</b><span>Multi-year trends with anomaly detection.</span></div>
    <div><b>Explainable guidance</b><span>Every signal links to its source records.</span></div>
    <div><b>Lifestyle programs</b><span>Activity and nutrition plans that adapt.</span></div>
    <div><b>Emergency readiness</b><span>One-tap card with contacts and nearby care.</span></div>
  </div>
  <div class="auth-stats">
    <div class="auth-stat"><b>2 yrs</b><span>Demo history</span></div>
    <div class="auth-stat"><b>37+</b><span>Health metrics</span></div>
    <div class="auth-stat"><b>40+</b><span>API endpoints</span></div>
  </div>
  <div class="auth-quote">“Finally, my parents' reports, my labs and my kids' vaccines live in one calm place — with plain-English explanations.”<b>— Demo family member · HealthSphere pilot</b></div>`;

function authHero(title, sub) {
  return `
  <div class="auth-hero">
    <div class="brand" style="padding-left:0"><span class="brand-mark">H</span><span class="brand-text"><b style="font-size:18px">HealthSphere</b><span class="brand-ai">AI</span></span></div>
    <div style="margin-top:26px"><span class="auth-eyebrow">Family health intelligence</span></div>
    <h1>${title}</h1>
    <p>${sub}</p>
    ${HERO_FEATURES}
    <div class="trust-strip">
      <span class="trust-pill"><i></i>Private by design</span>
      <span class="trust-pill"><i></i>Explainable signals</span>
      <span class="trust-pill"><i></i>No diagnosis claims</span>
    </div>
    <div style="margin-top:auto;padding-top:28px;font-size:11.5px;color:var(--ink-faint)">
      Informational only — not a substitute for professional medical advice.
    </div>
  </div>`;
}

VIEWS.login = function (container) {
  container.innerHTML = `
  <div class="auth-shell">
    ${authHero('Your family health, finally connected.',
      'Family history, reports, measurements and lifestyle — one record, analyzed continuously.')}
    <div class="auth-panel"><div class="auth-card"><div class="card">
      <h2 style="margin-bottom:2px">Welcome back</h2>
      <p class="page-sub">Sign in to your health workspace</p>
      <form id="f-login">
        <label>Email</label>
        <input name="email" type="email" required placeholder="you@example.com" autocomplete="email">
        <div class="mt"></div>
        <label>Password</label>
        <input name="password" type="password" required placeholder="Enter your password" autocomplete="current-password">
        <button class="btn big mt" type="submit">Sign in</button>
      </form>
      <div class="row mt" style="justify-content:space-between">
        <a href="#/register">Create an account</a>
        <button class="btn secondary sm" id="demo-btn" data-loading-text="Loading...">Explore the live demo</button>
      </div>
      <div class="demo-note"><b>Demo workspace</b> — pre-loaded with two years of health data, family history and processed lab reports.</div>
<div class="divider"></div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin-bottom:10px">Other Portals</div>
      <div class="portal-links">
        <a href="#/doctor/login" class="portal-link doctor">
          <span class="portal-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>
          <div class="portal-content"><b>Doctor</b><span>Consult portal</span></div>
          <span class="portal-arrow">→</span>
        </a>
        <a href="#/store-owner/login" class="portal-link store">
          <span class="portal-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></span>
          <div class="portal-content"><b>Store</b><span>Medical stores</span></div>
          <span class="portal-arrow">→</span>
        </a>
        <a href="#/admin/login" class="portal-link admin">
          <span class="portal-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
          <div class="portal-content"><b>Admin</b><span>Platform admin</span></div>
          <span class="portal-arrow">→</span>
        </a>
      </div>
    </div></div></div>
  </div>`;

  container.querySelector('#f-login').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      App.onAuthed({ ...r.user, isAdmin: !!r.isAdmin });
    } catch (err) { toast(err.message, 'err'); }
  };
  const demoBtn = container.querySelector('#demo-btn');
  demoBtn.onclick = async () => {
    const originalText = demoBtn.textContent;
    demoBtn.disabled = true;
    demoBtn.textContent = demoBtn.dataset.loadingText || 'Loading...';
    demoBtn.style.opacity = '.7';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: 'demo@healthsphere.ai', password: 'demo1234' } });
      App.onAuthed({ ...r.user, isAdmin: !!r.isAdmin });
    } catch (err) { toast(err.message, 'err'); }
    finally {
      demoBtn.disabled = false;
      demoBtn.textContent = originalText;
      demoBtn.style.opacity = '';
    }
  };
};

VIEWS.register = function (container) {
  // Consent copy is fetched lazily; fall back to a static summary if offline.
  const FALLBACK_TERMS = {
    version: '1.0', effectiveDate: '2026-01-01',
    title: 'Terms of Service, Privacy & Health Data Consent',
    requiredConsents: [
      { key: 'termsOfService', label: 'I accept the Terms of Service' },
      { key: 'healthDataConsent', label: 'I consent to processing of my personal & health data' },
      { key: 'acknowledgements', label: 'I acknowledge the medical, privacy & liability disclaimers' }
    ],
    body: [{ h: 'Terms unavailable offline', p: ['Connect to the internet to load the full Terms of Service.'] }]
  };
  let termsData = null;
  let termsRead = false; // becomes true once scrolled to bottom of the terms panel

  container.innerHTML = `
  <div class="auth-shell">
    ${authHero('A lifelong record that works for you.',
      'Set up your profile and family history in minutes.')}
    <div class="auth-panel"><div class="auth-card"><div class="card">
      <h2 style="margin-bottom:2px">Create account</h2>
      <p class="page-sub">Takes under a minute</p>
      <form id="f-reg">
        <label>Full name</label>
        <input name="name" required placeholder="Your full name">
        <div class="mt"></div>
        <label>Email</label>
        <input name="email" type="email" required placeholder="you@example.com">
        <div class="mt"></div>
        <label>Password (minimum 6 characters)</label>
        <input name="password" type="password" required minlength="6">

        <div class="consent-block mt" id="consent-block">
          <div class="consent-head">
            <b>Consent &amp; Terms</b>
            <button type="button" class="btn ghost sm" id="btn-view-terms">Read full Terms</button>
          </div>
          <p class="consent-summary" id="consent-summary">Loading Terms…</p>
          <div class="consent-rows" id="consent-rows"></div>
          <p class="consent-note">HealthSphere is an informational record-keeping tool — not a medical service, not a diagnostic device, and not a substitute for professional medical advice. You use the Service and rely on any output at your own risk.</p>
        </div>

        <button class="btn big mt" type="submit" id="btn-create" disabled>Create account</button>
        <p class="consent-hint" id="consent-hint">Accept all required consents above to continue.</p>
      </form>
      <div class="row mt" style="justify-content:flex-end"><a href="#/login">Already have an account?</a></div>
    </div></div></div>
  </div>`;

  const form = container.querySelector('#f-reg');
  const rowsEl = container.querySelector('#consent-rows');
  const summaryEl = container.querySelector('#consent-summary');
  const createBtn = container.querySelector('#btn-create');
  const hintEl = container.querySelector('#consent-hint');
  const viewBtn = container.querySelector('#btn-view-terms');

  function allChecked() {
    const boxes = [...rowsEl.querySelectorAll('input[type=checkbox][data-consent]')];
    return boxes.length > 0 && boxes.every(b => b.checked);
  }
  function refreshGate() {
    const ok = allChecked() && termsRead;
    createBtn.disabled = !ok;
    if (termsRead && allChecked()) hintEl.textContent = 'You can create your account.';
    else if (!termsRead) hintEl.textContent = 'Scroll through the Terms and accept all consents to continue.';
    else hintEl.textContent = 'Accept all required consents above to continue.';
  }

  function renderConsentRows(data) {
    summaryEl.innerHTML = `<b>${esc(data.title)}</b> · Version ${esc(data.version)} · Effective ${esc(data.effectiveDate)}`;
    rowsEl.innerHTML = (data.requiredConsents || []).map(c => `
      <label class="consent-row">
        <input type="checkbox" data-consent="${esc(c.key)}">
        <span>${esc(c.label)}</span>
      </label>`).join('');
    rowsEl.querySelectorAll('input[type=checkbox][data-consent]').forEach(b => b.onchange = refreshGate);
    refreshGate();
  }

  function renderTermsModal(data) {
    const clauses = (data.body || []).map(sec => `
      <section class="tc-sec">
        <h3>${esc(sec.h)}</h3>
        ${(sec.p || []).map(t => `<p>${esc(t)}</p>`).join('')}
      </section>`).join('');
    const modal = openModal(`
      <div class="tc-head">
        <div>
          <h2 style="margin:0">${esc(data.title)}</h2>
          <div class="page-sub">Version ${esc(data.version)} · Effective ${esc(data.effectiveDate)}</div>
        </div>
        <button class="btn sm secondary" id="tc-close">Close</button>
      </div>
      <div class="tc-scroll" id="tc-scroll" tabindex="0">${clauses}
        <p class="tc-end" id="tc-end">— End of Terms. Scroll to the end to enable acceptance. —</p>
      </div>
      <div class="tc-foot">
        <span class="page-sub" id="tc-progress">Scroll to the end of the document</span>
        <div class="row" style="gap:8px">
          <button class="btn sm secondary" id="tc-close2">Close</button>
          <button class="btn sm" id="tc-accept" disabled>I have read &amp; accept</button>
        </div>
      </div>`, { label: 'Terms of Service', wide: true });

    const scroller = modal.el.querySelector('#tc-scroll');
    const end = modal.el.querySelector('#tc-end');
    const accept = modal.el.querySelector('#tc-accept');
    const progress = modal.el.querySelector('#tc-progress');
    function onScroll() {
      // Mark read once the end marker is visible in the viewport.
      const r = end.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (r.bottom <= s.bottom + 4) {
        termsRead = true;
        accept.disabled = false;
        progress.textContent = 'You have scrolled to the end — you may accept.';
        refreshGate();
      }
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // Also allow keyboard End to satisfy the read gate.
    scroller.addEventListener('keydown', e => {
      if (e.key === 'End') { scroller.scrollTop = scroller.scrollHeight; setTimeout(onScroll, 40); }
    });
    modal.el.querySelector('#tc-close').onclick = () => modal.close();
    modal.el.querySelector('#tc-close2').onclick = () => modal.close();
    accept.onclick = () => {
      termsRead = true;
      // Auto-check the terms box; leave health/ack boxes for explicit user action.
      const t = rowsEl.querySelector('input[data-consent="termsOfService"]');
      if (t) t.checked = true;
      refreshGate();
      modal.close();
      toast('Terms marked as read and accepted.');
    };
    // Trigger initial measurement in case the doc is shorter than the viewport.
    setTimeout(onScroll, 50);
  }

  viewBtn.onclick = () => renderTermsModal(termsData || FALLBACK_TERMS);

  // Load real Terms from the API; fall back gracefully offline.
  api('/api/terms')
    .then(data => { termsData = data; renderConsentRows(data); })
    .catch(() => { termsData = FALLBACK_TERMS; renderConsentRows(FALLBACK_TERMS); });

  form.onsubmit = async e => {
    e.preventDefault();
    if (!allChecked() || !termsRead) {
      toast('Please read the Terms and accept all required consents.', 'err');
      return;
    }
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd);
    // Flatten consent checkboxes into explicit booleans for the backend.
    rowsEl.querySelectorAll('input[type=checkbox][data-consent]').forEach(b => {
      payload[b.dataset.consent] = b.checked;
    });
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: payload });
      toast('Account created. Welcome to HealthSphere.');
      App.onAuthed({ ...r.user, isAdmin: !!r.isAdmin });
    } catch (err) { toast(err.message, 'err'); }
  };
};
