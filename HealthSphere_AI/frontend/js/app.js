/* ---------- App shell & hash router ---------- */

const App = {
  user: null,
  doctorUser: null,
  storeOwner: null,
  adminUser: null,

  async boot() {
    // Single session lookup for all roles (patient / doctor / store-owner).
    // Falls back to the legacy per-role endpoints when the server is old.
    if (!this._hashBound) {
      this._hashBound = true;
      window.addEventListener('hashchange', () => this.route());
    }
    try {
      const s = await api('/api/session');
      if (s && s.role === 'patient' && s.user) return this.onAuthed({ ...s.user, isAdmin: !!s.isAdmin }, false);
      if (s && s.role === 'doctor' && s.doctor) return this.onDoctorAuthed(s.doctor, false);
      if (s && s.role === 'store-owner' && s.owner) return this.onStoreOwnerAuthed(s.owner, s.store, false);
      return this.routeAuth();
    } catch {
      try {
        const me = await api('/api/me');
        this.onAuthed({ ...me.user, isAdmin: !!me.isAdmin }, false);
      } catch {
        try {
          const dm = await api('/api/doctor/me');
          this.onDoctorAuthed(dm.doctor, false);
        } catch {
          try {
            const sm = await api('/api/store/me');
            this.onStoreOwnerAuthed(sm.owner, sm.store, false);
          } catch {
            this.routeAuth();
          }
        }
      }
    }
  },

  /* ---- Patient Auth ---- */
  onAuthed(user, navigate = true) {
    this.user = user;
    this.doctorUser = null;
    this.storeOwner = null;
    this.renderShell();
    if (navigate || !location.hash || ['#/login', '#/register', '#/welcome', '#/', '#/doctor/login', '#/doctor/register', '#/store-owner/login', '#/store-owner/register', '#/admin/login'].includes(location.hash)) {
      location.hash = '#/dashboard';
    }
    this.route();
  },

  routeAuth() {
    this.user = null;
    this.doctorUser = null;
    this.storeOwner = null;
    if (window.Assistant) Assistant.hide();
    const view = document.getElementById('app');
    const hash = location.hash || '#/welcome';
    if (hash === '#/doctor/login' || hash === '#/doctor/register') return this.routeDoctorAuth();
    if (hash === '#/store-owner/login' || hash === '#/store-owner/register') return this.routeStoreOwnerAuth();
    if (hash === '#/admin/login') return this.routeAdminAuth();
    if (hash === '#/login') return (VIEWS.login || VIEWS.welcome)(view);
    if (hash === '#/register') return (VIEWS.register || VIEWS.welcome)(view);
    return (VIEWS.welcome || VIEWS.login)(view);
  },

  /* ---- Doctor Auth ---- */
  onDoctorAuthed(doctor, navigate = true) {
    this.doctorUser = doctor;
    this.user = null;
    this.storeOwner = null;
    this.renderDoctorShell();
    if (navigate || !location.hash || ['#/login', '#/register', '#/doctor/login', '#/doctor/register'].includes(location.hash)) {
      location.hash = '#/doctor/dashboard';
    }
    this.routeDoctor();
  },

  routeDoctorAuth() {
    this.doctorUser = null;
    const view = document.getElementById('app');
    const name = location.hash === '#/doctor/register' ? 'doctor-register' : 'doctor-login';
    (VIEWS[name] || VIEWS['doctor-login'])(view);
  },

  /* ---- Store Owner Auth ---- */
  onStoreOwnerAuthed(owner, store, navigate = true) {
    this.storeOwner = owner;
    this.user = null;
    this.doctorUser = null;
    this.renderStoreOwnerShell();
    if (navigate || !location.hash || ['#/login', '#/register', '#/store-owner/login', '#/store-owner/register'].includes(location.hash)) {
      location.hash = '#/store-owner/dashboard';
    }
    this.routeStoreOwner();
  },

  routeStoreOwnerAuth() {
    this.storeOwner = null;
    const view = document.getElementById('app');
    const name = location.hash === '#/store-owner/register' ? 'store-register' : 'store-login';
    (VIEWS[name] || VIEWS['store-login'])(view);
  },

  /* ---- Admin Login (separate entry point) ---- */
  routeAdminAuth() {
    const view = document.getElementById('app');
    view.innerHTML = `
    <div class="auth-shell">
      <div class="auth-hero">
        <div class="brand" style="padding-left:0"><b style="font-size:18px">HealthSphere</b><span>AI</span></div>
        <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8fd6cc;font-weight:700;margin-top:24px">Admin Portal</div>
        <h1 style="color:#fff;font-size:33px;line-height:1.18;margin-top:42px;font-weight:800">Platform Administration</h1>
        <p style="color:#90a1ac;max-width:46ch;font-size:14.5px">Manage doctors, stores, users, and system settings. Use your admin email to sign in through the main login.</p>
      </div>
      <div class="auth-panel"><div class="auth-card"><div class="card">
        <h2 style="margin-bottom:2px">Admin Sign In</h2>
        <p class="page-sub">Sign in with an admin-registered email</p>
        <form id="f-admin-login">
          <label>Email</label>
          <input name="email" type="email" required placeholder="admin@healthsphere.ai">
          <div class="mt"></div>
          <label>Password</label>
          <input name="password" type="password" required placeholder="Enter your password">
          <button class="btn big mt" type="submit">Sign in</button>
        </form>
        <div class="divider"></div>
        <div class="portal-links">
          <a href="#/login" class="portal-link">
            <span class="portal-icon">P</span>
            <b>Patient Portal</b>
            <span>Back to patient login</span>
            <span class="portal-arrow">Open &rarr;</span>
          </a>
        </div>
      </div></div></div>
    </div>`;

    view.querySelector('#f-admin-login').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const r = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
        App.onAuthed({ ...r.user, isAdmin: !!r.isAdmin });
      } catch (err) { toast(err.message, 'err'); }
    };
  },

  /* ==================== SHELLS ==================== */

  renderShell() {
    const initials = (this.user?.name || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    const GROUPS = [
      { label: 'Record', links: [
        ['#/dashboard', 'Overview'], ['#/profile', 'Profile'],
        ['#/family', 'Family'], ['#/reports', 'Reports'],
        ['#/timeline', 'Timeline']] },
      { label: 'Plan', links: [
        ['#/insights', 'Insights'], ['#/lifestyle', 'Lifestyle'],
        ['#/reminders', 'Reminders']] },
      { label: 'Care', links: [
        ['#/consult', 'Doctors'], ['#/stores', 'Stores'],
        ['#/care', 'Care team'], ['#/hospitals', 'Nearby'], ['#/storage', 'Storage'], ['#/settings', 'Settings']] },
    ];
    const ALL = [...GROUPS.flatMap(g => g.links), ...(this.user?.isAdmin ? [['#/admin', 'Admin']] : [])];
    document.getElementById('app').innerHTML = `
      <div class="shell top-shell">
        <a class="skip-link" href="#view">Skip to content</a>
        <header class="topnav">
          <div class="topnav-inner">
            <div class="brand"><span class="brand-mark" aria-hidden="true">H</span><span class="brand-text"><b>HealthSphere</b><span class="brand-ai">AI</span></span></div>
            <button class="cmdk-trigger" id="cmdk-trigger" aria-label="Search and jump (Ctrl K)">
              <span class="cmdk-icon" aria-hidden="true">${window.icon ? window.icon('search', 16) : '⌕'}</span>
              <span class="cmdk-ph">Search reports, metrics, family…</span>
              <kbd>⌘K</kbd>
            </button>
            <div class="topnav-right">
              <span id="net-pill" class="net-pill" hidden>Offline — showing saved data</span>
              <button class="btn ghost sm" id="nav-assistant">${window.icon ? window.icon('sparkles', 15) : ''}AI Assistant</button>
              <button class="icon-btn" data-h="#/reminders" title="Notifications & reminders" aria-label="Notifications">
                ${window.icon ? window.icon('bell', 18) : '<span aria-hidden="true">◔</span>'}<span class="dot" aria-hidden="true"></span>
              </button>
              <button class="emergency-btn" data-h="#/emergency">SOS</button>
              <div class="avatar" title="${esc(this.user?.name || '')}" aria-hidden="true">${esc(initials)}</div>
              <div class="u-meta"><b>${esc(this.user?.name || '')}</b></div>
              <button id="logout-btn" class="signout-btn" title="Sign out">Sign out</button>
            </div>
          </div>
          <nav class="topnav-links" aria-label="Primary">
            ${GROUPS.map(g => `<span class="nav-group-label">${g.label}</span>${g.links.map(([h, l]) => `<button class="nav-item" data-h="${h}">${l}</button>`).join('')}`).join('<span class="nav-group-sep" aria-hidden="true"></span>')}
            ${this.user?.isAdmin ? `<span class="nav-group-sep" aria-hidden="true"></span><button class="nav-item nav-admin" data-h="#/admin">Admin</button>` : ''}
          </nav>
          <div class="crumbbar"><div class="crumbbar-inner"><span id="crumbs" aria-live="polite"></span></div></div>
        </header>
        <main class="main" id="view" tabindex="-1"></main>
        <footer class="app-footer">HealthSphere AI · Informational only — not a substitute for professional medical advice.</footer>
        <div class="cmdk-overlay" id="cmdk-overlay" hidden>
          <div class="cmdk" role="dialog" aria-modal="true" aria-label="Quick navigation">
            <input id="cmdk-input" type="search" placeholder="Search your health records or jump anywhere…" aria-label="Quick navigation" autocomplete="off">
            <div class="cmdk-list" id="cmdk-list">
              <div id="cmdk-results"></div>
              <div class="cmdk-group-label" id="cmdk-nav-label">Go to</div>
              <div id="cmdk-nav">
              ${ALL.map(([h, l]) => `<button class="cmdk-item" data-h="${h}"><span class="cmdk-item-ic" aria-hidden="true">${window.icon ? window.icon('arrow-right', 15) : '→'}</span><span class="cmdk-item-main"><span class="cmdk-item-label">${l}</span></span><span class="cmdk-item-hint">${h.replace('#/', '')}</span></button>`).join('')}
              </div>
            </div>
            <div class="cmdk-foot"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
          </div>
        </div>
        <button id="fb-fab" title="Send feedback" aria-label="Send feedback">${window.icon ? window.icon('message', 17) : '✎'}<span>Feedback</span></button>
      </div>`;

    this._bindShellNav();
    document.getElementById('nav-assistant').onclick = () => window.Assistant && Assistant.toggle(true);
    this._bindCmdk();
    this._bindFeedback();
    this._bindNetBadge();
    if (window.Assistant) Assistant.mount();
    document.getElementById('logout-btn').onclick = async () => {
      await api('/api/auth/logout', { method: 'POST' });
      this.user = null;
      location.hash = '#/login';
      this.routeAuth();
      toast('Signed out');
    };
  },

  _bindCmdk() {
    const overlay = document.getElementById('cmdk-overlay');
    const input = document.getElementById('cmdk-input');
    const list = document.getElementById('cmdk-list');
    const resultsBox = document.getElementById('cmdk-results');
    const navBox = document.getElementById('cmdk-nav');
    const trigger = document.getElementById('cmdk-trigger');
    if (!overlay || !input || !list) return;
    const items = () => [...list.querySelectorAll('.cmdk-item')].filter(b => b.style.display !== 'none');
    let idx = 0;
    const paint = () => {
      const vis = items();
      if (idx >= vis.length) idx = Math.max(0, vis.length - 1);
      vis.forEach((b, i) => b.classList.toggle('selected', i === idx));
      vis[idx]?.scrollIntoView?.({ block: 'nearest' });
    };
    const open = () => { overlay.hidden = false; input.value = ''; if (resultsBox) resultsBox.innerHTML = ''; filterNav(''); idx = 0; paint(); setTimeout(() => input.focus(), 0); };
    const close = () => { overlay.hidden = true; trigger?.focus?.(); };
    const filterNav = q => {
      q = q.trim().toLowerCase(); idx = 0;
      navBox?.querySelectorAll('.cmdk-item').forEach(b => {
        b.style.display = (!q || (b.textContent || '').toLowerCase().includes(q)) ? '' : 'none';
      });
      const navLabel = document.getElementById('cmdk-nav-label');
      if (navLabel) navLabel.style.display = [...(navBox?.querySelectorAll('.cmdk-item') || [])].some(b => b.style.display !== 'none') ? '' : 'none';
      paint();
    };
    let deb = null, seq = 0;
    const searchRecords = q => {
      clearTimeout(deb);
      if (!resultsBox || q.trim().length < 2) { if (resultsBox) resultsBox.innerHTML = ''; return; }
      deb = setTimeout(async () => {
        const my = ++seq;
        try {
          const r = await api('/api/search?q=' + encodeURIComponent(q.trim()));
          if (my !== seq || overlay.hidden) return;
          resultsBox.innerHTML = (r.groups || []).map(g => `
            <div class="cmdk-group-label">${esc(g.key)}</div>
            ${g.items.map(it => `<button class="cmdk-item" data-h="${esc(it.hash)}">
              <span class="cmdk-item-ic" aria-hidden="true">${window.icon ? window.icon(it.icon || 'search', 15) : ''}</span>
              <span class="cmdk-item-main"><span class="cmdk-item-label">${esc(it.label)}</span>${it.sub ? `<span class="cmdk-item-sub">${esc(it.sub)}</span>` : ''}</span>
              <span class="cmdk-item-type">${esc(it.type || '')}</span>
            </button>`).join('')}`).join('');
          resultsBox.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { close(); location.hash = b.dataset.h; });
          idx = 0; paint();
        } catch { /* keep navigation working when search fails */ }
      }, 250);
    };
    trigger && (trigger.onclick = open);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusables = [...overlay.querySelectorAll('input, button')].filter(el => !el.disabled && el.style.display !== 'none');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    input.addEventListener('input', () => { filterNav(input.value); searchRecords(input.value); });
    input.addEventListener('keydown', e => {
      const vis = items();
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(vis.length - 1, idx + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); const t = vis[idx]; if (t) { close(); location.hash = t.dataset.h; } }
      else if (e.key === 'Escape') close();
    });
    if (!this._cmdkKey) {
      this._cmdkKey = e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          const o = document.getElementById('cmdk-overlay');
          if (!o) return;
          if (o.hidden) { if (typeof App._bindCmdkOpen === 'function') App._bindCmdkOpen(); }
          else if (typeof App._cmdkClose === 'function') App._cmdkClose();
          else o.hidden = true;
        } else if (e.key === 'Escape') {
          const o = document.getElementById('cmdk-overlay');
          if (o && !o.hidden && typeof App._cmdkClose === 'function') App._cmdkClose();
        }
      };
      document.addEventListener('keydown', this._cmdkKey);
    }
    this._bindCmdkOpen = open;
    this._cmdkClose = close;
  },

  _bindNetBadge() {
    const paint = () => {
      const el = document.getElementById('net-pill');
      if (el) el.hidden = navigator.onLine !== false;
    };
    paint();
    if (!this._netBound) {
      this._netBound = true;
      window.addEventListener('online', paint);
      window.addEventListener('offline', () => { paint(); toast('You are offline — showing your last saved data.'); });
    }
  },

  _bindFeedback() {
    const fab = document.getElementById('fb-fab');
    if (!fab) return;
    fab.onclick = () => {
      let ftype = 'idea';
      const m = openModal(`
        <h2>Send feedback</h2>
        <p class="page-sub">Bugs, ideas, or praise — it lands directly with the care team.</p>
        <div class="fb-form">
          <div class="fb-type-row" role="radiogroup" aria-label="Feedback type">
            ${[['bug', 'alert', 'Bug'], ['idea', 'sparkles', 'Idea'], ['praise', 'star', 'Praise']].map(([v, ic, l]) =>
              `<button class="fb-type${v === ftype ? ' selected' : ''}" data-ft="${v}" role="radio" aria-checked="${v === ftype}">${window.icon ? window.icon(ic, 17) : ''}${l}</button>`).join('')}
          </div>
          <label for="fb-msg">Message</label>
          <textarea id="fb-msg" maxlength="2000" placeholder="What happened, or what would you love to see?"></textarea>
          <div class="row mt" style="justify-content:flex-end">
            <button class="btn secondary" id="fb-cancel">Cancel</button>
            <button class="btn" id="fb-send">${window.icon ? window.icon('send', 15) : ''}Send feedback</button>
          </div>
        </div>`);
      m.el.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => {
        ftype = b.dataset.ft;
        m.el.querySelectorAll('[data-ft]').forEach(x => {
          const on = x === b;
          x.classList.toggle('selected', on);
          x.setAttribute('aria-checked', on);
        });
      });
      m.el.querySelector('#fb-cancel').onclick = () => m.close();
      const msg = m.el.querySelector('#fb-msg');
      setTimeout(() => msg.focus(), 50);
      m.el.querySelector('#fb-send').onclick = async () => {
        try {
          await api('/api/feedback', { method: 'POST', body: { type: ftype, message: msg.value, page: location.hash } });
          m.close();
          toast('Thanks — your feedback was recorded.');
        } catch (e) { toast(e.message, 'err'); }
      };
    };
  },

  renderDoctorShell() {
    const d = this.doctorUser;
    const initials = (d?.name || 'D').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    const isVerified = d?.verificationStatus === 'verified';
    const isOnline = d?.availabilityStatus === 'online';
    document.getElementById('app').innerHTML = `
      <div class="shell with-sidebar">
        <aside class="sidebar">
          <div class="brand"><span class="brand-mark">H</span><b>HealthSphere</b><span>AI</span></div>
          <div class="brand-sub">Doctor Portal</div>
          <div class="nav-label">Consultation</div>
          <button class="nav-item" data-h="#/doctor/dashboard">Dashboard</button>
          <div class="nav-label">Account</div>
          <button class="nav-item" data-h="#/settings">Settings</button>
          <div class="nav-sep"></div>
          <div class="side-user">
            <div class="avatar">${esc(initials)}</div>
            <div class="u-meta">
              <b>${esc(d?.name || '')}</b>
              <span>${esc(d?.specialization || '')}</span>
            </div>
          </div>
          <div style="padding:6px 10px;font-size:11px">
            <span class="chip ${isVerified ? (isOnline ? 'ok' : 'neutral') : 'warn'}">${isVerified ? (isOnline ? 'Online' : 'Offline') : 'Pending Verification'}</span>
          </div>
          <div style="padding:4px 10px">
            <a href="#/login" style="font-size:11px;color:#7d95a1">← Patient login</a>
          </div>
          <div style="padding:4px 10px">
            <button id="doc-logout-btn" style="background:none;border:none;color:#7d95a1;font-size:11.5px;cursor:pointer;font-family:inherit;padding:4px 6px">Sign out</button>
          </div>
        </aside>
        <main class="main" id="view"></main>
      </div>`;

    this._bindShellNav();
    document.getElementById('doc-logout-btn').onclick = async () => {
      await api('/api/doctor/auth/logout', { method: 'POST' });
      this.doctorUser = null;
      location.hash = '#/doctor/login';
      this.routeDoctorAuth();
      toast('Signed out');
    };
  },

  renderStoreOwnerShell() {
    const o = this.storeOwner;
    const initials = (o?.ownerName || 'S').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    document.getElementById('app').innerHTML = `
      <div class="shell with-sidebar">
        <aside class="sidebar">
          <div class="brand"><span class="brand-mark">H</span><b>HealthSphere</b><span>AI</span></div>
          <div class="brand-sub">Store Owner Portal</div>
          <div class="nav-label">Store</div>
          <button class="nav-item" data-h="#/store-owner/dashboard">My Store</button>
          <div class="nav-label">Account</div>
          <button class="nav-item" data-h="#/settings">Settings</button>
          <div class="nav-sep"></div>
          <div class="side-user">
            <div class="avatar">${esc(initials)}</div>
            <div class="u-meta">
              <b>${esc(o?.storeName || '')}</b>
              <span>${esc(o?.ownerName || '')}</span>
            </div>
          </div>
          <div style="padding:4px 10px">
            <a href="#/login" style="font-size:11px;color:#7d95a1">← Patient login</a>
          </div>
          <div style="padding:4px 10px">
            <button id="store-logout-btn" style="background:none;border:none;color:#7d95a1;font-size:11.5px;cursor:pointer;font-family:inherit;padding:4px 6px">Sign out</button>
          </div>
        </aside>
        <main class="main" id="view"></main>
      </div>`;

    this._bindShellNav();
    document.getElementById('store-logout-btn').onclick = async () => {
      await api('/api/store/auth/logout', { method: 'POST' });
      this.storeOwner = null;
      location.hash = '#/store-owner/login';
      this.routeStoreOwnerAuth();
      toast('Signed out');
    };
  },

  _bindShellNav() {
    if (!this._navDelegated) {
      this._navDelegated = true;
      document.addEventListener('click', e => {
        const t = e.target && e.target.closest ? e.target.closest('[data-h],[data-nav]') : null;
        if (!t || !document.contains(t)) return;
        const h = t.getAttribute('data-h') || t.getAttribute('data-nav');
        if (h && h.startsWith('#/')) {
          e.preventDefault();
          if (location.hash === h) App.route();
          else location.hash = h;
        }
      });
    }
    this.activeNav();
  },

  activeNav() {
    const cur = (location.hash || '#/dashboard').split('?')[0];
    const NAMES = {
      '#/dashboard': 'Overview', '#/profile': 'Profile', '#/family': 'Family history',
      '#/reports': 'Medical reports', '#/timeline': 'Timeline', '#/insights': 'Insights & risks',
      '#/lifestyle': 'Lifestyle', '#/reminders': 'Reminders', '#/consult': 'Consult a doctor',
      '#/stores': 'Medical stores', '#/care': 'Care team', '#/hospitals': 'Nearby care', '#/storage': 'File storage',
      '#/settings': 'Settings', '#/admin': 'Admin', '#/emergency': 'Emergency mode',
    };
    let activeBtn = null;
    document.querySelectorAll('.nav-item[data-h]').forEach(b => {
      const on = b.dataset.h === cur;
      b.classList.toggle('active', on);
      if (on) activeBtn = b;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const crumbs = document.getElementById('crumbs');
    if (crumbs) {
      const label = NAMES[cur] || 'Overview';
      crumbs.innerHTML = `<span class="crumb-home">HealthSphere</span><span class="crumb-sep" aria-hidden="true">/</span><span class="crumb-current">${esc(label)}</span>`;
    }
  },

  /* ==================== ROUTERS ==================== */

  async route() {
    this._navId = (this._navId || 0) + 1;
    const my = this._navId;
    const hash = location.hash || '#/dashboard';
    // Route to appropriate portal
    if (hash.startsWith('#/doctor/')) return this.routeDoctor();
    if (hash.startsWith('#/store-owner/')) return this.routeStoreOwner();

    // Patient routes
    if (!this.user) return this.routeAuth();
    if (!document.querySelector('.shell')) this.renderShell();
    this.activeNav();
    const rawName = hash.replace(/^#\//, '').split('?')[0] || 'dashboard';
    // `#/consult/room/<id>` → the consult-room view (it parses the id from the hash itself)
    const name = rawName.startsWith('consult/room/') ? 'consult-room' : rawName;
    const view = document.getElementById('view');
    const fn = VIEWS[name];
    if (!fn) { view.innerHTML = '<div class="empty">Page not found</div>'; return; }
    view.innerHTML = `<div class="skel-load">
      <div class="skel" style="height:64px"></div>
      <div class="grid g4"><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div></div>
      <div class="skel" style="height:220px"></div>
    </div>`;
    try {
      await fn(view);
      if (my !== this._navId) return;
      if (window.HealthGraph) HealthGraph.mount(view);
      window.scrollTo(0, 0);
    } catch (e) {
      if (my !== this._navId) return;
      console.error(e);
      if (/sign in/i.test(e.message)) { this.user = null; return this.routeAuth(); }
      view.innerHTML = `<div class="card empty">Something went wrong: ${esc(e.message)}<br><br><a href="#/dashboard">Back to dashboard</a></div>`;
    }
  },

  async routeDoctor() {
    this._navId = (this._navId || 0) + 1;
    const my = this._navId;
    if (!this.doctorUser) return this.routeDoctorAuth();
    if (!document.querySelector('.shell')) this.renderDoctorShell();
    this.activeNav();
    const name = (location.hash || '#/doctor/dashboard').replace(/^#\//, '').split('?')[0].replace(/\//g, '-');
    const view = document.getElementById('view');
    const fn = VIEWS[name];
    if (!fn) { view.innerHTML = '<div class="empty">Page not found</div>'; return; }
    view.innerHTML = `<div class="skel-load"><div class="skel" style="height:200px"></div></div>`;
    try {
      await fn(view);
      if (my !== this._navId) return;
      window.scrollTo(0, 0);
    } catch (e) {
      if (my !== this._navId) return;
      console.error(e);
      if (/sign in/i.test(e.message)) { this.doctorUser = null; return this.routeDoctorAuth(); }
      view.innerHTML = `<div class="card empty">Something went wrong: ${esc(e.message)}</div>`;
    }
  },

  async routeStoreOwner() {
    this._navId = (this._navId || 0) + 1;
    const my = this._navId;
    if (!this.storeOwner) return this.routeStoreOwnerAuth();
    if (!document.querySelector('.shell')) this.renderStoreOwnerShell();
    this.activeNav();
    const name = (location.hash || '#/store-owner/dashboard').replace(/^#\//, '').split('?')[0].replace(/\//g, '-');
    const view = document.getElementById('view');
    const fn = VIEWS[name];
    if (!fn) { view.innerHTML = '<div class="empty">Page not found</div>'; return; }
    view.innerHTML = `<div class="skel-load"><div class="skel" style="height:200px"></div></div>`;
    try {
      await fn(view);
      if (my !== this._navId) return;
      window.scrollTo(0, 0);
    } catch (e) {
      if (my !== this._navId) return;
      console.error(e);
      if (/sign in/i.test(e.message)) { this.storeOwner = null; return this.routeStoreOwnerAuth(); }
      view.innerHTML = `<div class="card empty">Something went wrong: ${esc(e.message)}</div>`;
    }
  }
};

window.App = App;
App.boot();
