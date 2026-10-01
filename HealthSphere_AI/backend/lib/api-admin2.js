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
