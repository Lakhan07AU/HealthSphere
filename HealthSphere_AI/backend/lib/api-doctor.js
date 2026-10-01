import crypto from 'node:crypto';
import { db, persist } from './db.js';
import { hashPassword, verifyPassword, audit, parseToken } from './auth.js';
import { loginRateLimit } from './ratelimit.js';
import { uid, todayISO } from './util.js';

/* ==================== DOCTOR AUTH & API ROUTES ==================== */

export const doctorRoutes = [];
const route = (method, pattern, handler, opts = {}) => doctorRoutes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ---------- Doctor Auth ---------- */
function issueDoctorSession(doctorId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    token,
    userId: doctorId,
    role: 'doctor',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  });
  if (db.sessions.length > 500) db.sessions = db.sessions.slice(-300);
  persist();
  return token;
}

function getAuthedDoctor(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
    })
  );
  let token = cookies.hs_token;
  const authz = req.headers.authorization || '';
  if (!token && authz.startsWith('Bearer ')) token = authz.slice(7);
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  if (session.role !== 'doctor') return null;
  return db.doctorAccounts.find(d => d.id === session.userId) || null;
}

route('POST', /^\/api\/doctor\/auth\/register$/, (req, res, p) => {
  try {
    const b = p.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim();
    const password = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (!name) throw new Error('Name is required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!b.qualification) throw new Error('Qualification is required.');
    if (!b.specialization) throw new Error('Specialization is required.');
    if (!b.licenseNumber) throw new Error('License/Registration number is required.');
    if (db.doctorAccounts.some(d => d.email === email)) throw new Error('An account with this email already exists.');

    const { salt, hash } = hashPassword(password);
    const doctor = {
      id: uid('docacc'), email, name, passwordSalt: salt, passwordHash: hash,
      qualification: b.qualification, specialization: b.specialization,
      licenseNumber: b.licenseNumber, idProof: b.idProof || '',
      yearsExp: Number(b.yearsExp) || 0, fee: Number(b.fee) || 0,
      verificationStatus: 'pending', availabilityStatus: 'offline',
      createdAt: new Date().toISOString()
    };
    db.doctorAccounts.push(doctor);
    persist();
    const token = issueDoctorSession(doctor.id);
    res.setHeader('Set-Cookie', `hs_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
    ok(res, { doctor: pubDoctor(doctor), token });
  } catch (e) { bad(res, e); }
}, { auth: false });

route('POST', /^\/api\/doctor\/auth\/login$/, (req, res, p) => {
  const { allowed, retryAfterSec } = loginRateLimit(p.req);
  if (!allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSec) });
    res.end(JSON.stringify({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }));
    return;
  }
  try {
    const b = p.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const doctor = db.doctorAccounts.find(d => d.email === email);
    if (!doctor || !verifyPassword(String(b.password || ''), doctor.passwordSalt, doctor.passwordHash)) {
      throw new Error('Invalid email or password.');
    }
    const token = issueDoctorSession(doctor.id);
    res.setHeader('Set-Cookie', `hs_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
    ok(res, { doctor: pubDoctor(doctor), token });
  } catch (e) { bad(res, e, 401); }
}, { auth: false });

route('POST', /^\/api\/doctor\/auth\/logout$/, (req, res, p) => {
  const token = parseToken(p.req);
  if (token) { db.sessions = db.sessions.filter(s => s.token !== token); persist(); }
  res.setHeader('Set-Cookie', 'hs_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  ok(res, { ok: true });
}, { auth: false });

route('GET', /^\/api\/doctor\/me$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);
  ok(res, { doctor: pubDoctor(doctor) });
});

/* ---------- Doctor Profile ---------- */
route('PUT', /^\/api\/doctor\/profile$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);
  const b = p.body || {};
  for (const k of ['name', 'qualification', 'specialization', 'licenseNumber', 'idProof', 'yearsExp', 'fee']) {
    if (k in b) doctor[k] = k === 'yearsExp' || k === 'fee' ? Number(b[k]) || 0 : b[k];
  }
  persist();
  ok(res, { doctor: pubDoctor(doctor) });
});

/* ---------- Doctor Availability Toggle ---------- */
route('POST', /^\/api\/doctor\/availability$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);
  if (doctor.verificationStatus !== 'verified') return bad(res, new Error('Your account must be verified before going online.'));
  const b = p.body || {};
  doctor.availabilityStatus = b.status === 'online' ? 'online' : 'offline';
  persist();
  ok(res, { availabilityStatus: doctor.availabilityStatus });
});

/* ---------- Doctor Dashboard ---------- */
route('GET', /^\/api\/doctor\/dashboard$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);

  const now = new Date();
  const tickets = db.consultTickets.filter(t =>
    t.specialization === doctor.specialization &&
    t.status !== 'expired' &&
    t.status !== 'rejected'
  );

  const myAppointments = db.consultAppointments.filter(a => a.doctorId === doctor.id);
  const upcoming = myAppointments.filter(a => a.status === 'confirmed' && new Date(a.confirmedSlot) >= now);
  const past = myAppointments.filter(a => a.status !== 'confirmed' || new Date(a.confirmedSlot) < now);

  ok(res, {
    doctor: pubDoctor(doctor),
    pendingTickets: tickets.filter(t => t.status === 'pending'),
    myAppointments: upcoming.sort((a, b) => new Date(a.confirmedSlot) - new Date(b.confirmedSlot)),
    pastAppointments: past.sort((a, b) => new Date(b.confirmedSlot) - new Date(a.confirmedSlot)).slice(0, 20)
  });
});

/* ---------- Ticket Actions ---------- */
route('GET', /^\/api\/doctor\/tickets$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);

  const now = new Date();
  const tickets = db.consultTickets
    .filter(t => t.specialization === doctor.specialization && t.status !== 'expired')
    .map(t => ({
      ...t,
      isExpired: t.status === 'pending' && t.expiresAt && new Date(t.expiresAt) < now
    }));

  ok(res, { tickets });
});

route('POST', /^\/api\/doctor\/tickets\/([\w-]+)\/accept$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);
  if (doctor.verificationStatus !== 'verified') return bad(res, new Error('Account not verified.'));
  if (doctor.availabilityStatus !== 'online') return bad(res, new Error('You must be online to accept tickets.'));

  const ticket = db.consultTickets.find(t => t.id === p.params[0]);
  if (!ticket) return bad(res, new Error('Ticket not found.'), 404);
  if (ticket.status !== 'pending') return bad(res, new Error('This ticket is no longer pending.'));
  if (ticket.specialization !== doctor.specialization) return bad(res, new Error('Specialization mismatch.'));

  const b = p.body || {};
  const slot = b.confirmedSlot || (ticket.preferredSlots && ticket.preferredSlots[0]) || new Date().toISOString();
  const sessionId = crypto.randomBytes(12).toString('hex');
  const sessionLink = `/consult/room/${sessionId}`;

  ticket.status = 'accepted';
  ticket.assignedDoctorId = doctor.id;

  const appointment = {
    id: uid('apt'),
    ticketId: ticket.id,
    doctorId: doctor.id,
    doctorName: doctor.name,
    patientId: ticket.patientId,
    patientName: ticket.patientName,
    confirmedSlot: slot,
    sessionLink,
    sessionId,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  db.consultAppointments.push(appointment);
  persist();

  ok(res, { ticket, appointment });
});

route('POST', /^\/api\/doctor\/tickets\/([\w-]+)\/reject$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);

  const ticket = db.consultTickets.find(t => t.id === p.params[0]);
  if (!ticket) return bad(res, new Error('Ticket not found.'), 404);
  if (ticket.status !== 'pending') return bad(res, new Error('This ticket is no longer pending.'));

  const b = p.body || {};
  ticket.status = 'rejected';
  ticket.rejectedBy = doctor.id;
  ticket.rejectionReason = b.reason || '';
  persist();

  ok(res, { ticket });
});

/* ---------- Doctor Appointments ---------- */
route('GET', /^\/api\/doctor\/appointments$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);

  const now = new Date();
  const all = db.consultAppointments.filter(a => a.doctorId === doctor.id);
  const upcoming = all.filter(a => a.status === 'confirmed' && new Date(a.confirmedSlot) >= now);
  const past = all.filter(a => a.status !== 'confirmed' || new Date(a.confirmedSlot) < now);

  ok(res, {
    upcoming: upcoming.sort((a, b) => new Date(a.confirmedSlot) - new Date(b.confirmedSlot)),
    past: past.sort((a, b) => new Date(b.confirmedSlot) - new Date(a.confirmedSlot)).slice(0, 30)
  });
});

/* ---------- Chat Messages ---------- */
route('GET', /^\/api\/consult\/messages\/([\w-]+)$/, (req, res, p) => {
  const user = getAuthedDoctor(p.req);
  if (!user) return bad(res, new Error('Please sign in.'), 401);
  const aptId = p.params[0];
  const msgs = db.consultMessages[aptId] || [];
  ok(res, { messages: msgs });
});

route('POST', /^\/api\/consult\/messages\/([\w-]+)$/, (req, res, p) => {
  const user = getAuthedDoctor(p.req);
  if (!user) return bad(res, new Error('Please sign in.'), 401);
  const aptId = p.params[0];
  const b = p.body || {};
  if (!b.text) return bad(res, new Error('Message text required.'));
  if (!db.consultMessages[aptId]) db.consultMessages[aptId] = [];
  const msg = {
    id: uid('msg'),
    senderId: user.id,
    senderName: user.name,
    senderRole: 'doctor',
    text: String(b.text).slice(0, 2000),
    ts: new Date().toISOString()
  };
  db.consultMessages[aptId].push(msg);
  persist();
  ok(res, { message: msg });
});

/* ---------- helpers ---------- */
function pubDoctor(d) {
  return {
    id: d.id, email: d.email, name: d.name,
    qualification: d.qualification, specialization: d.specialization,
    licenseNumber: d.licenseNumber, idProof: d.idProof,
    yearsExp: d.yearsExp, fee: d.fee,
    verificationStatus: d.verificationStatus,
    availabilityStatus: d.availabilityStatus,
    createdAt: d.createdAt
  };
}

/* ---------- Doctor Public Profile (for patients) ---------- */
route('GET', /^\/api\/doctors\/online$/, (req, res, p) => {
  const online = db.doctorAccounts
    .filter(d => d.verificationStatus === 'verified' && d.availabilityStatus === 'online')
    .map(d => ({
      id: d.id, name: d.name, qualification: d.qualification,
      specialization: d.specialization, yearsExp: d.yearsExp, fee: d.fee
    }));
  ok(res, { doctors: online });
});

route('GET', /^\/api\/doctors\/([\w-]+)\/profile$/, (req, res, p) => {
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  ok(res, { doctor: pubDoctor(d) });
});

/* ---------- Doctor gets patient info for appointment ---------- */
route('GET', /^\/api\/doctor\/patients\/([\w-]+)$/, (req, res, p) => {
  const doctor = getAuthedDoctor(p.req);
  if (!doctor) return bad(res, new Error('Please sign in as a doctor.'), 401);
  const patientId = p.params[0];
  const patient = db.users.find(u => u.id === patientId);
  if (!patient) return bad(res, new Error('Patient not found.'), 404);
  const profile = db.profiles[patientId] || {};
  ok(res, {
    patient: { id: patient.id, name: patient.name },
    profile: {
      dob: profile.dob, sex: profile.sex, bloodGroup: profile.bloodGroup,
      allergies: profile.allergies || [], conditions: profile.conditions || [],
      medications: profile.medications || []
    }
  });
});

/* ---------- All verified online doctors by specialization ---------- */
route('GET', /^\/api\/doctors\/by-specialization\/([\w-]+)$/, (req, res, p) => {
  const spec = decodeURIComponent(p.params[0]);
  const docs = db.doctorAccounts
    .filter(d => d.verificationStatus === 'verified' && d.specialization === spec)
    .map(d => ({
      id: d.id, name: d.name, qualification: d.qualification,
      specialization: d.specialization, yearsExp: d.yearsExp, fee: d.fee,
      availabilityStatus: d.availabilityStatus
    }));
  ok(res, { doctors: docs });
});
