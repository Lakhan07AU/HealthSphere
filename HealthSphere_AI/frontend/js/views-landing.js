/* ---------- Public landing page (pre-login marketing) ---------- */

VIEWS.welcome = function (container) {
  const I = (n, s = 18) => (window.icon ? window.icon(n, s) : '');
  container.innerHTML = `
  <div class="lp">
    <header class="lp-nav">
      <div class="lp-nav-inner">
        <a class="brand" href="#/welcome"><span class="brand-mark" aria-hidden="true">H</span><span class="brand-text"><b>HealthSphere</b><span class="brand-ai">AI</span></span></a>
        <nav class="lp-links" aria-label="Landing">
          <a href="#lp-features">Features</a>
          <a href="#lp-how">How it works</a>
          <a href="#lp-portals">Portals</a>
        </nav>
        <div class="lp-nav-cta">
          <a class="btn ghost sm" href="#/login">Sign in</a>
          <button class="btn sm" id="lp-demo-top">Try live demo</button>
        </div>
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-inner">
        <div class="lp-hero-copy">
          <span class="auth-eyebrow">Family health intelligence · Free demo</span>
          <h1>Your family's health, finally connected.</h1>
          <p>Reports, measurements, family history, and lifestyle — one health graph, analyzed continuously into plain-English guidance. No app install. Works on your phone.</p>
          <div class="lp-cta-row">
            <button class="btn big" id="lp-demo" style="width:auto;padding:14px 28px">Explore the live demo</button>
            <a class="btn secondary big" style="width:auto;padding:14px 28px" href="#/register">Create free account</a>
          </div>
          <div class="trust-strip">
            <span class="trust-pill"><i></i>Private by design</span>
            <span class="trust-pill"><i></i>Explainable signals</span>
            <span class="trust-pill"><i></i>Not a diagnosis tool</span>
          </div>
        </div>
        <div class="lp-mock" aria-hidden="true">
          <div class="lp-mock-bar"><span></span><span></span><span></span><em>healthsphere · overview</em></div>
          <div class="lp-mock-body">
            <div class="lp-mock-kpis"><div><b>6.0</b><span>HbA1c %</span></div><div><b>131</b><span>LDL mg/dL</span></div><div><b>4</b><span>Signals</span></div></div>
            <div class="lp-mock-chart"><i style="height:38%"></i><i style="height:52%"></i><i style="height:47%"></i><i style="height:63%"></i><i style="height:58%"></i><i style="height:74%"></i><i style="height:89%"></i></div>
            <div class="lp-mock-signal"><span class="pill pill-warning"><span class="pill-dot"></span>Watch</span><span>HbA1c trending up across reports</span></div>
            <div class="lp-mock-signal"><span class="pill pill-normal"><span class="pill-dot"></span>Normal</span><span>Sleep averaging 6.8 h/night</span></div>
          </div>
        </div>
      </div>
      <div class="lp-stats">
        <div><b>37+</b><span>health metrics tracked</span></div>
        <div><b>4</b><span>portals: patient · doctor · store · admin</span></div>
        <div><b>100%</b><span>signals linked to source records</span></div>
        <div><b>$0</b><span>to try — pre-loaded demo workspace</span></div>
      </div>
    </section>

    <section class="lp-section" id="lp-features">
      <div class="lp-wrap">
        <h2>Everything your family's health needs, in one place</h2>
        <p class="page-sub" style="max-width:60ch">Upload a lab report and watch it become trends, signals, reminders, and next steps — each one traceable to its source.</p>
        <div class="lp-feats">
          ${[
            ['file-text', 'Document intelligence', 'PDFs and photos become structured, trend-ready data with reference-range flags.'],
            ['trending-up', 'Trend engine', 'Multi-year slopes, sudden-change and anomaly detection across every metric.'],
            ['shield-check', 'Explainable signals', 'Every risk signal lists its reasons — family, labs, trends, lifestyle. Never a diagnosis.'],
            ['pill', 'Lifestyle hub', 'Activity plans, adaptive meal grids, hydration targets, weekly insights.'],
            ['map-pin', 'Nearby hospitals', 'Live OpenStreetMap discovery around your GPS location, ranked by distance.'],
            ['bell', 'Reminders & SOS', 'Screening and medication nudges plus one-tap emergency mode with SOS.'],
          ].map(([ic, t, d]) => `<div class="lp-feat"><span class="lp-feat-ic">${I(ic, 20)}</span><b>${t}</b><span>${d}</span></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="lp-section lp-alt" id="lp-how">
      <div class="lp-wrap">
        <h2>Live in three steps</h2>
        <div class="lp-steps">
          <div class="lp-step"><span class="lp-step-n">1</span><b>Create your account</b><span>Add your profile and family history in minutes.</span></div>
          <div class="lp-step"><span class="lp-step-n">2</span><b>Upload a report</b><span>Values are extracted, flagged, and trended automatically.</span></div>
          <div class="lp-step"><span class="lp-step-n">3</span><b>Act on guidance</b><span>Screenings, reminders, and doctors worth discussing.</span></div>
        </div>
        <div class="lp-cta-row"><button class="btn" id="lp-demo-2">Start with the live demo</button></div>
      </div>
    </section>

    <section class="lp-section" id="lp-portals">
      <div class="lp-wrap">
        <h2>One platform, four doors</h2>
        <div class="lp-portals">
          <a class="portal-link doctor" href="#/login"><span class="portal-icon">${I('cross', 18)}</span><div class="portal-content"><b>Patient</b><span>Your health workspace</span></div><span class="portal-arrow">→</span></a>
          <a class="portal-link doctor" href="#/doctor/login"><span class="portal-icon">${I('users', 18)}</span><div class="portal-content"><b>Doctor</b><span>Consult portal</span></div><span class="portal-arrow">→</span></a>
          <a class="portal-link store" href="#/store-owner/login"><span class="portal-icon">${I('store', 18)}</span><div class="portal-content"><b>Store</b><span>Medical stores</span></div><span class="portal-arrow">→</span></a>
          <a class="portal-link admin" href="#/admin/login"><span class="portal-icon">${I('sliders', 18)}</span><div class="portal-content"><b>Admin</b><span>Platform admin</span></div><span class="portal-arrow">→</span></a>
        </div>
      </div>
    </section>

    <section class="lp-cta">
      <div class="lp-wrap">
        <h2>See your health graph in 30 seconds</h2>
        <p>No signup needed — open the pre-loaded demo workspace with two years of family data.</p>
        <div class="lp-cta-row" style="justify-content:center"><button class="btn hero-white big" id="lp-demo-3" style="width:auto;padding:14px 30px">Open the live demo</button></div>
        <p class="lp-fine">Demo login: demo@healthsphere.ai · informational only, not medical advice.</p>
      </div>
    </section>

    <footer class="lp-footer">
      <div class="lp-wrap spread">
        <div class="brand"><span class="brand-mark" aria-hidden="true">H</span><span class="brand-text"><b>HealthSphere</b><span class="brand-ai">AI</span></span></div>
        <div class="lp-foot-links"><a href="#/login">Sign in</a><a href="#/register">Register</a><a href="#/doctor/login">Doctors</a><a href="#/emergency">Emergency</a></div>
      </div>
      <div class="lp-wrap"><p class="lp-fine">HealthSphere AI organizes and explains health information. It does not diagnose, prescribe, or replace healthcare professionals.</p></div>
    </footer>
  </div>`;

  const demoLogin = async (btn) => {
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Opening demo…';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: 'demo@healthsphere.ai', password: 'demo1234' } });
      App.onAuthed({ ...r.user, isAdmin: !!r.isAdmin });
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.innerHTML = orig; }
  };
  ['lp-demo', 'lp-demo-top', 'lp-demo-2', 'lp-demo-3'].forEach(id => {
    const b = container.querySelector('#' + id);
    if (b) b.onclick = () => demoLogin(b);
  });
  window.scrollTo(0, 0);
};
