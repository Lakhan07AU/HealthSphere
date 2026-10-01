/* ---------- Store Owner Auth views (login / register) ---------- */

const STORE_CATEGORIES = [
  'Pharmacy', 'Medical Equipment', 'Ayurvedic Store', 'Homeopathy Store',
  'Surgical Supply', 'Optical Store', 'Health Supplement', 'Diagnostic Lab'
];

function storeAuthHero(title, sub) {
  return `
  <div class="auth-hero store-hero">
    <div class="brand" style="padding-left:0"><b style="font-size:18px">HealthSphere</b><span>AI</span></div>
    <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8fd6cc;font-weight:700;margin-top:24px">Store Owner Portal</div>
    <h1>${title}</h1>
    <p>${sub}</p>
    <div style="margin-top:auto;padding-top:34px;font-size:11.5px;color:#7d948f">
      List your store and reach patients looking for medical products and services.
    </div>
  </div>`;
}

VIEWS['store-login'] = function (container) {
  container.innerHTML = `
  <div class="auth-shell">
    ${storeAuthHero('List your store, reach more patients.',
      'Sign in to manage your store listing, offers, and business hours.')}
    <div class="auth-panel"><div class="auth-card"><div class="card">
      <h2 style="margin-bottom:2px">Store Owner Sign In</h2>
      <p class="page-sub">Manage your medical store listing</p>
      <form id="f-store-login">
        <label>Email</label>
        <input name="email" type="email" required placeholder="store@example.com" autocomplete="email">
        <div class="mt"></div>
        <label>Password</label>
        <input name="password" type="password" required placeholder="Enter your password" autocomplete="current-password">
        <button class="btn big mt" type="submit">Sign in</button>
      </form>
      <div class="row mt" style="justify-content:space-between">
        <a href="#/store-owner/register">Register your store</a>
        <a href="#/login" class="btn secondary sm">Patient login</a>
      </div>
    </div></div></div>
  </div>`;

  container.querySelector('#f-store-login').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/store/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      App.onStoreOwnerAuthed(r.owner, r.store);
    } catch (err) { toast(err.message, 'err'); }
  };
};

VIEWS['store-register'] = function (container) {
  container.innerHTML = `
  <div class="auth-shell">
    ${storeAuthHero('Get your store listed on HealthSphere.',
      'Register your medical store and reach patients looking for products and services nearby.')}
    <div class="auth-panel"><div class="auth-card"><div class="card" style="max-height:85vh;overflow-y:auto">
      <h2 style="margin-bottom:2px">Register Your Store</h2>
      <p class="page-sub">Fill in your store details</p>
      <form id="f-store-reg">
        <label>Owner Full Name</label>
        <input name="ownerName" required placeholder="Your full name">
        <div class="mt"></div>
        <label>Email</label>
        <input name="email" type="email" required placeholder="store@example.com">
        <div class="mt"></div>
        <label>Password (min 6 characters)</label>
        <input name="password" type="password" required minlength="6">
        <div class="mt"></div>
        <label>Store Name</label>
        <input name="storeName" required placeholder="e.g. HealthPlus Pharmacy">
        <div class="mt"></div>
        <label>Store Category</label>
        <select name="category" required>
          ${STORE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <div class="mt"></div>
        <label>Store License / Registration Number</label>
        <input name="licenseNumber" required placeholder="Drug license or business registration No.">
        <div class="mt"></div>
        <label>Full Address</label>
        <textarea name="address" required rows="2" placeholder="Street, Area, City, State, Pincode"></textarea>
        <div class="mt"></div>
        <label>Contact Phone</label>
        <input name="contact" placeholder="+91 XXXXX XXXXX">
        <div class="mt"></div>
        <label>Operating Hours</label>
        <input name="hours" placeholder="e.g. Mon-Sat: 9AM-9PM">
        <button class="btn big mt" type="submit">Submit for Approval</button>
      </form>
      <div class="row mt" style="justify-content:flex-end"><a href="#/store-owner/login">Already have an account?</a></div>
    </div></div></div>
  </div>`;

  container.querySelector('#f-store-reg').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/store/auth/register', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Store registered. Awaiting admin approval.');
      App.onStoreOwnerAuthed(r.owner, r.store);
    } catch (err) { toast(err.message, 'err'); }
  };
};
