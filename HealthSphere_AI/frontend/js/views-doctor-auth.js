/* ---------- Doctor Auth views (login / register) ---------- */

const DOC_SPECIALIZATIONS = [
  'General Physician', 'Cardiologist', 'Dermatologist', 'Endocrinologist',
  'ENT Specialist', 'Gastroenterologist', 'Gynecologist', 'Neurologist',
  'Oncologist', 'Ophthalmologist', 'Orthopedic', 'Pediatrician',
  'Psychiatrist', 'Pulmonologist', 'Urologist'
];

function docAuthHero(title, sub) {
  return `
  <div class="auth-hero doc-hero">
    <div class="brand" style="padding-left:0"><b style="font-size:18px">HealthSphere</b><span>AI</span></div>
    <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8fd6cc;font-weight:700;margin-top:24px">Doctor Portal</div>
    <h1>${title}</h1>
    <p>${sub}</p>
    <div style="margin-top:auto;padding-top:34px;font-size:11.5px;color:#7d948f">
      Verified doctors provide consultations through this platform.
    </div>
  </div>`;
}

VIEWS['doctor-login'] = function (container) {
  container.innerHTML = `
  <div class="auth-shell">
    ${docAuthHero('Provide consultations, help patients remotely.',
      'Sign in to manage your availability, view patient tickets, and conduct appointments.')}
    <div class="auth-panel"><div class="auth-card"><div class="card">
      <h2 style="margin-bottom:2px">Doctor Sign In</h2>
      <p class="page-sub">Access your consultation dashboard</p>
      <form id="f-doc-login">
        <label>Email</label>
        <input name="email" type="email" required placeholder="doctor@example.com" autocomplete="email">
        <div class="mt"></div>
        <label>Password</label>
        <input name="password" type="password" required placeholder="Enter your password" autocomplete="current-password">
        <button class="btn big mt" type="submit">Sign in</button>
      </form>
      <div class="row mt" style="justify-content:space-between">
        <a href="#/doctor/register">Register as a doctor</a>
        <a href="#/login" class="btn secondary sm">Patient login</a>
      </div>
    </div></div></div>
  </div>`;

  container.querySelector('#f-doc-login').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/doctor/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      App.onDoctorAuthed(r.doctor);
    } catch (err) { toast(err.message, 'err'); }
  };
};

VIEWS['doctor-register'] = function (container) {
  container.innerHTML = `
  <div class="auth-shell">
    ${docAuthHero('Join HealthSphere as a verified practitioner.',
      'Complete your profile and credentials. Admin will verify your account before you can go online.')}
    <div class="auth-panel"><div class="auth-card"><div class="card" style="max-height:85vh;overflow-y:auto">
      <h2 style="margin-bottom:2px">Doctor Registration</h2>
      <p class="page-sub">Fill in your professional details</p>
      <form id="f-doc-reg">
        <label>Full Name</label>
        <input name="name" required placeholder="Dr. Your Name">
        <div class="mt"></div>
        <label>Email</label>
        <input name="email" type="email" required placeholder="doctor@example.com">
        <div class="mt"></div>
        <label>Password (min 6 characters)</label>
        <input name="password" type="password" required minlength="6">
        <div class="mt"></div>
        <label>Qualification</label>
        <input name="qualification" required placeholder="MBBS, MD, etc.">
        <div class="mt"></div>
        <label>Specialization</label>
        <select name="specialization" required>
          <option value="">Select specialization</option>
          ${DOC_SPECIALIZATIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <div class="mt"></div>
        <label>License / Registration Number</label>
        <input name="licenseNumber" required placeholder="Medical council registration No.">
        <div class="mt"></div>
        <label>ID Proof (text description or ID number)</label>
        <input name="idProof" placeholder="Aadhaar / Passport / Driving License No.">
        <div class="mt"></div>
        <label>Years of Experience</label>
        <input name="yearsExp" type="number" min="0" placeholder="0">
        <div class="mt"></div>
        <label>Consultation Fee (optional, in INR)</label>
        <input name="fee" type="number" min="0" placeholder="0 for free">
        <button class="btn big mt" type="submit">Submit for Verification</button>
      </form>
      <div class="row mt" style="justify-content:flex-end"><a href="#/doctor/login">Already have an account?</a></div>
    </div></div></div>
  </div>`;

  container.querySelector('#f-doc-reg').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/doctor/auth/register', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Registration submitted. Awaiting admin verification.');
      App.onDoctorAuthed(r.doctor);
    } catch (err) { toast(err.message, 'err'); }
  };
};
