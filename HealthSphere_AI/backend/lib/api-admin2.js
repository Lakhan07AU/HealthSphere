import { db, persist } from './db.js';
import { isAdmin, audit } from './auth.js';
import { uid } from './util.js';

/* ==================== EXTENDED ADMIN ROUTES ==================== */

export const admin2Routes = [];
const route = (method, pattern, handler, opts = {}) => admin2Routes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function adminOnly(res, p) {
  if (!p.user || !isAdmin(p.user)) { bad(res, new Error('Admin access required.'), 403); return false; }
  return true;
}

/* ---------- Doctor Verification ---------- */
route('GET', /^\/api\/admin\/doctors$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, {
    doctors: db.doctorAccounts.map(d => ({
      id: d.id, email: d.email, name: d.name,
      qualification: d.qualification, specialization: d.specialization,
      licenseNumber: d.licenseNumber, yearsExp: d.yearsExp, fee: d.fee,
      verificationStatus: d.verificationStatus, availabilityStatus: d.availabilityStatus,
      createdAt: d.createdAt
    }))
  });
});

route('GET', /^\/api\/admin\/doctors\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  ok(res, { doctor: d });
});

route('POST', /^\/api\/admin\/doctors\/([\w-]+)\/approve$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  d.verificationStatus = 'verified';
  audit(p.user.id, 'doctor_verified', `${d.name} (${d.email})`);
  persist();
  ok(res, { doctor: d });
});

route('POST', /^\/api\/admin\/doctors\/([\w-]+)\/reject$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  const b = p.body || {};
  d.verificationStatus = 'rejected';
  d.rejectionReason = b.reason || '';
  audit(p.user.id, 'doctor_rejected', `${d.name} — ${b.reason || 'no reason'}`);
  persist();
  ok(res, { doctor: d });
});

route('POST', /^\/api\/admin\/doctors\/([\w-]+)\/suspend$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  d.verificationStatus = 'suspended';
  d.availabilityStatus = 'offline';
  audit(p.user.id, 'doctor_suspended', d.name);
  persist();
  ok(res, { doctor: d });
});

/* ---------- Store Verification ---------- */
route('GET', /^\/api\/admin\/stores$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, {
    stores: db.stores.map(s => ({
      id: s.id, name: s.name, category: s.category, address: s.address,
      contact: s.contact, status: s.status, views: s.views, clicks: s.clicks,
      ownerId: s.ownerId, createdAt: s.createdAt
    })),
    owners: db.storeOwnerAccounts.map(o => ({
      id: o.id, email: o.email, ownerName: o.ownerName, storeName: o.storeName,
      licenseNumber: o.licenseNumber, verificationStatus: o.verificationStatus,
      createdAt: o.createdAt
    }))
  });
});

route('POST', /^\/api\/admin\/stores\/([\w-]+)\/approve$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  store.status = 'approved';
  const owner = db.storeOwnerAccounts.find(o => o.id === store.ownerId);
  if (owner) owner.verificationStatus = 'verified';
  audit(p.user.id, 'store_approved', store.name);
  persist();
  ok(res, { store });
});

route('POST', /^\/api\/admin\/stores\/([\w-]+)\/reject$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const b = p.body || {};
  store.status = 'rejected';
  const owner = db.storeOwnerAccounts.find(o => o.id === store.ownerId);
  if (owner) { owner.verificationStatus = 'rejected'; owner.rejectionReason = b.reason || ''; }
  audit(p.user.id, 'store_rejected', `${store.name} — ${b.reason || ''}`);
  persist();
  ok(res, { store });
});

route('POST', /^\/api\/admin\/stores\/([\w-]+)\/suspend$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  store.status = 'suspended';
  audit(p.user.id, 'store_suspended', store.name);
  persist();
  ok(res, { store });
});

/* ---------- Admin Tickets / Appointments Overview ---------- */
route('GET', /^\/api\/admin\/tickets$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, { tickets: db.consultTickets.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100) });
});

route('GET', /^\/api\/admin\/appointments$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, { appointments: db.consultAppointments.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100) });
});

/* ---------- Ticket Detail + Chat + Cancel ---------- */
route('GET', /^\/api\/admin\/tickets\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const t = db.consultTickets.find(x => x.id === p.params[0]);
  if (!t) return bad(res, new Error('Ticket not found.'), 404);
  const appt = db.consultAppointments.find(a => a.ticketId === t.id);
  const messages = appt ? (db.consultMessages[appt.id] || []) : [];
  const patient = db.users.find(u => u.id === t.patientId);
  const doctor = db.doctorAccounts.find(d => d.id === t.assignedDoctorId);
  ok(res, {
    ticket: t,
    appointment: appt || null,
    messages,
    patient: patient ? { id: patient.id, name: patient.name, email: patient.email } : null,
    doctor: doctor ? { id: doctor.id, name: doctor.name, specialization: doctor.specialization } : null
  });
});

route('DELETE', /^\/api\/admin\/tickets\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const t = db.consultTickets.find(x => x.id === p.params[0]);
  if (!t) return bad(res, new Error('Ticket not found.'), 404);
  const appt = db.consultAppointments.find(a => a.ticketId === t.id);
  if (appt) {
    delete db.consultMessages[appt.id];
    db.consultAppointments = db.consultAppointments.filter(a => a.id !== appt.id);
  }
  db.consultTickets = db.consultTickets.filter(x => x.id !== t.id);
  audit(p.user.id, 'admin_deleted_ticket', `${t.specialization} — ${t.patientName || t.patientId}`);
  persist();
  ok(res, { ok: true, message: 'Ticket and associated appointment removed.' });
});

/* ---------- Store Detail ---------- */
route('GET', /^\/api\/admin\/stores\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const owner = db.storeOwnerAccounts.find(o => o.id === store.ownerId);
  ok(res, {
    store,
    owner: owner ? {
      id: owner.id, email: owner.email, ownerName: owner.ownerName, storeName: owner.storeName,
      licenseNumber: owner.licenseNumber, verificationStatus: owner.verificationStatus,
      rejectionReason: owner.rejectionReason, createdAt: owner.createdAt, contact: owner.contact,
      address: owner.address, hours: owner.hours
    } : null,
    productCount: (store.products || []).length,
    offerCount: (store.offers || []).length
  });
});

/* ---------- Doctor Detail with Appointments + Tickets ---------- */
route('GET', /^\/api\/admin\/doctors\/([\w-]+)\/detail$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  const appointments = db.consultAppointments.filter(a => a.doctorId === d.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30);
  const tickets = db.consultTickets.filter(t => t.assignedDoctorId === d.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20);
  const sessions = db.sessions.filter(s => s.userId === d.id && s.role === 'doctor'
    && new Date(s.expiresAt) > new Date());
  const { passwordSalt, passwordHash, ...pubDoc } = d;
  ok(res, { doctor: pubDoc, appointments, tickets, activeSessions: sessions.length });
});

/* ---------- Reactivate Doctor / Store ---------- */
route('POST', /^\/api\/admin\/doctors\/([\w-]+)\/reactivate$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const d = db.doctorAccounts.find(x => x.id === p.params[0]);
  if (!d) return bad(res, new Error('Doctor not found.'), 404);
  d.verificationStatus = 'verified';
  d.rejectionReason = undefined;
  audit(p.user.id, 'doctor_reactivated', `${d.name} (${d.email})`);
  persist();
  ok(res, { doctor: d });
});

route('POST', /^\/api\/admin\/stores\/([\w-]+)\/reactivate$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  store.status = 'approved';
  const owner = db.storeOwnerAccounts.find(o => o.id === store.ownerId);
  if (owner) { owner.verificationStatus = 'verified'; owner.rejectionReason = undefined; }
  audit(p.user.id, 'store_reactivated', store.name);
  persist();
  ok(res, { store });
});

/* ---------- Sessions ---------- */
route('GET', /^\/api\/admin\/sessions$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const byId = Object.fromEntries(db.users.map(u => [u.id, u]));
  const byDoc = Object.fromEntries(db.doctorAccounts.map(d => [d.id, d]));
  const now = new Date();
  const sessions = db.sessions
    .filter(s => new Date(s.expiresAt) > now)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(s => {
      const u = byId[s.userId];
      const doc = byDoc[s.userId];
      return {
        token: s.token.slice(0, 12) + '…',
        tokenFull: s.token,
        userId: s.userId,
        userName: u?.name || doc?.name || 'Unknown',
        userEmail: u?.email || doc?.email || '—',
        role: s.role || 'patient',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt
      };
    });
  ok(res, { sessions, totalActive: sessions.length });
});

route('DELETE', /^\/api\/admin\/sessions\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const token = p.params[0];
  const s = db.sessions.find(x => x.token === token);
  if (!s) return bad(res, new Error('Session not found.'), 404);
  db.sessions = db.sessions.filter(x => x.token !== token);
  audit(p.user.id, 'admin_revoked_session', `User ${s.userId}`);
  persist();
  ok(res, { ok: true, message: 'Session revoked.' });
});

/* ---------- Platform Stats ---------- */
route('GET', /^\/api\/admin\/stats$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const now = new Date();
  const dayAgo = new Date(now - 86400000);
  const weekAgo = new Date(now - 7 * 86400000);
  const activeSessions = db.sessions.filter(s => new Date(s.expiresAt) > now);
  const recentLogins = [];
  for (const [id, list] of Object.entries(db.audit)) {
    for (const a of list) {
      if (a.action === 'login' && new Date(a.ts) > dayAgo) {
        const u = db.users.find(x => x.id === id);
        recentLogins.push({ ts: a.ts, email: u?.email || id });
      }
    }
  }
  ok(res, {
    users: db.users.length,
    newUsersToday: db.users.filter(u => new Date(u.createdAt) > dayAgo).length,
    newUsersWeek: db.users.filter(u => new Date(u.createdAt) > weekAgo).length,
    doctors: db.doctorAccounts.length,
    doctorsPending: db.doctorAccounts.filter(d => d.verificationStatus === 'pending').length,
    stores: db.stores.length,
    storesPending: db.stores.filter(s => s.status === 'pending').length,
    activeSessions: activeSessions.length,
    totalTickets: db.consultTickets.length,
    totalAppointments: db.consultAppointments.length,
    openFeedback: db.feedback.filter(f => f.status === 'open').length,
    totalFeedback: db.feedback.length,
    totalReports: Object.values(db.reports).reduce((n, a) => n + (a?.length || 0), 0),
    recentLogins: recentLogins.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 10)
  });
});
