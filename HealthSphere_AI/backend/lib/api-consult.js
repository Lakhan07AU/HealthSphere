import { db, persist } from './db.js';
import { uid } from './util.js';

/* ==================== PATIENT CONSULTATION API ==================== */

export const consultRoutes = [];
const route = (method, pattern, handler, opts = {}) => consultRoutes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ---------- Raise Consultation Ticket ---------- */
route('POST', /^\/api\/consult\/tickets$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.specialization) return bad(res, new Error('Please select a specialization.'));

  const TICKET_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  const now = new Date();

  const ticket = {
    id: uid('ctk'),
    patientId: p.user.id,
    patientName: p.user.name,
    specialization: b.specialization,
    symptoms: String(b.symptoms || '').slice(0, 1000),
    preferredSlots: Array.isArray(b.preferredSlots) ? b.preferredSlots.slice(0, 5) : [],
    urgency: b.urgency || 'normal',
    status: 'pending',
    assignedDoctorId: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TICKET_TIMEOUT_MS).toISOString()
  };
  db.consultTickets.push(ticket);

  // Auto-expire old pending tickets
  const expired = db.consultTickets.filter(t =>
    t.status === 'pending' && t.expiresAt && new Date(t.expiresAt) < now
  );
  for (const t of expired) t.status = 'expired';

  persist();
  ok(res, { ticket });
});

/* ---------- Patient Ticket History ---------- */
route('GET', /^\/api\/consult\/tickets$/, (req, res, p) => {
  const now = new Date();
  // Auto-expire old pending tickets
  const expired = db.consultTickets.filter(t =>
    t.status === 'pending' && t.expiresAt && new Date(t.expiresAt) < now
  );
  for (const t of expired) t.status = 'expired';
  if (expired.length) persist();

  const tickets = db.consultTickets
    .filter(t => t.patientId === p.user.id)
    .map(t => enrichTicket(t))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  ok(res, { tickets });
});

/* ---------- Patient Appointments ---------- */
route('GET', /^\/api\/consult\/appointments$/, (req, res, p) => {
  const now = new Date();
  const appts = db.consultAppointments.filter(a => a.patientId === p.user.id);
  const upcoming = appts.filter(a => a.status === 'confirmed' && new Date(a.confirmedSlot) >= now);
  const past = appts.filter(a => a.status !== 'confirmed' || new Date(a.confirmedSlot) < now);
  ok(res, {
    upcoming: upcoming.sort((a, b) => new Date(a.confirmedSlot) - new Date(b.confirmedSlot))
      .map(a => enrichAppointment(a)),
    past: past.sort((a, b) => new Date(b.confirmedSlot) - new Date(a.confirmedSlot)).slice(0, 20)
      .map(a => enrichAppointment(a))
  });
});

/* ---------- Patient Chat Messages ---------- */
route('GET', /^\/api\/consult\/chat\/([\w-]+)$/, (req, res, p) => {
  const aptId = p.params[0];
  const apt = db.consultAppointments.find(a => a.id === aptId && a.patientId === p.user.id);
  if (!apt) return bad(res, new Error('Appointment not found.'), 404);
  const msgs = db.consultMessages[aptId] || [];
  ok(res, { messages: msgs });
});

route('POST', /^\/api\/consult\/chat\/([\w-]+)$/, (req, res, p) => {
  const aptId = p.params[0];
  const apt = db.consultAppointments.find(a => a.id === aptId && a.patientId === p.user.id);
  if (!apt) return bad(res, new Error('Appointment not found.'), 404);
  const b = p.body || {};
  if (!b.text) return bad(res, new Error('Message text required.'));
  if (!db.consultMessages[aptId]) db.consultMessages[aptId] = [];
  const msg = {
    id: uid('msg'),
    senderId: p.user.id,
    senderName: p.user.name,
    senderRole: 'patient',
    text: String(b.text).slice(0, 2000),
    ts: new Date().toISOString()
  };
  db.consultMessages[aptId].push(msg);
  persist();
  ok(res, { message: msg });
});

/* ---------- Available Specializations ---------- */
route('GET', /^\/api\/consult\/specializations$/, (req, res, p) => {
  const online = db.doctorAccounts.filter(d => d.verificationStatus === 'verified' && d.availabilityStatus === 'online');
  const allVerified = db.doctorAccounts.filter(d => d.verificationStatus === 'verified');
  const specs = [...new Set(allVerified.map(d => d.specialization))].sort();
  const onlineBySpec = {};
  for (const d of online) onlineBySpec[d.specialization] = (onlineBySpec[d.specialization] || 0) + 1;
  ok(res, {
    specializations: specs,
    onlineCount: online.length,
    onlineBySpecialization: onlineBySpec
  });
});

/* ---------- Ticket detail with doctor info ---------- */
route('GET', /^\/api\/consult\/tickets\/([\w-]+)$/, (req, res, p) => {
  const ticket = db.consultTickets.find(t => t.id === p.params[0] && t.patientId === p.user.id);
  if (!ticket) return bad(res, new Error('Ticket not found.'), 404);
  ok(res, { ticket: enrichTicket(ticket) });
});

/* ---------- Enrichment helpers ---------- */
function enrichTicket(t) {
  const result = { ...t };
  if (t.assignedDoctorId) {
    const doc = db.doctorAccounts.find(d => d.id === t.assignedDoctorId);
    if (doc) {
      result.doctorInfo = {
        name: doc.name, qualification: doc.qualification,
        specialization: doc.specialization, yearsExp: doc.yearsExp
      };
    }
  }
  // Find appointment if exists
  const apt = db.consultAppointments.find(a => a.ticketId === t.id);
  if (apt) {
    result.appointmentId = apt.id;
    result.sessionId = apt.sessionId;
    result.sessionLink = apt.sessionLink;
  }
  return result;
}

function enrichAppointment(a) {
  const result = { ...a };
  // Add doctor info
  const doc = db.doctorAccounts.find(d => d.id === a.doctorId);
  if (doc) {
    result.doctorInfo = {
      name: doc.name, qualification: doc.qualification,
      specialization: doc.specialization, yearsExp: doc.yearsExp, fee: doc.fee
    };
  }
  // Add patient info
  const patient = db.users.find(u => u.id === a.patientId);
  if (patient) {
    result.patientInfo = { name: patient.name };
  }
  return result;
}
