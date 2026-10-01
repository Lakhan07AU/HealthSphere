import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, persist, coll, objColl, storageMode, DATA_DIR } from './db.js';
import { saveFile, readFile, deleteFile, storageBackend, shouldEmbed, locate, EMBED_MAX } from './storage.js';
import {
  registerUser, loginUser, logoutToken, getAuthedUser, parseToken,
  changePassword, audit, isAdmin
} from './auth.js';
import { loginRateLimit } from './ratelimit.js';
import { processDocument, explainReport, flagFor } from './extraction.js';
import { buildSeries, analyzeSeries, labelOf } from './trends.js';
import { getInsights, emergencyCard } from './insights.js';
import { createReminder, reminderAction, syncAutoReminders } from './reminders.js';
import { buildTimeline, TYPE_META } from './timeline.js';
import { generateActivityPlan, generateNutritionPlan, weeklyInsight, MEALS, getMealAlternatives } from './lifestyle.js';
import { CITIES, searchFacilities, fetchNearbyLive, geocodePlace } from './hospitals.js';
import { askAssistant } from './assistant.js';
import { uid, todayISO } from './util.js';
import { doctorRoutes } from './api-doctor.js';
import { storeRoutes } from './api-store.js';
import { admin2Routes } from './api-admin2.js';
import { ensureSeed } from './seed.js';
import { consultRoutes } from './api-consult.js';

/* ============================ API ROUTES ============================ */

export const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ---------- HEALTH (docker/load-balancer probes) ---------- */
route('GET', /^\/api\/health$/, (req, res) => {
  ok(res, { ok: true, uptimeSec: Math.round(process.uptime()), storage: storageMode(), ts: new Date().toISOString() });
}, { auth: false });

/* ---------- AUTH ---------- */
function checkLoginRate(req, res) {
  const { allowed, retryAfterSec } = loginRateLimit(req);
  if (!allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSec) });
    res.end(JSON.stringify({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }));
    return false;
  }
  return true;
}

route('POST', /^\/api\/auth\/register$/, (req, res, p) => {
  if (!checkLoginRate(p.req, res)) return;
  try {
    const user = registerUser(p.body || {});
    initUserData(user.id);
    audit(user.id, 'account_created');
    const { token } = loginUser({ email: p.body.email, password: p.body.password });
    setAuth(res, token);
    ok(res, { user: pub(user), token, isAdmin: isAdmin(user) });
  } catch (e) { bad(res, e); }
}, { auth: false });

route('POST', /^\/api\/auth\/login$/, (req, res, p) => {
  if (!checkLoginRate(p.req, res)) return;
  try {
    const { user, token } = loginUser(p.body || {});
    audit(user.id, 'login');
    setAuth(res, token);
    ok(res, { user: pub(user), token, isAdmin: isAdmin(user) });
  } catch (e) { bad(res, e, 401); }
}, { auth: false });

route('POST', /^\/api\/auth\/logout$/, (req, res, p) => {
  logoutToken(p.req);
  res.setHeader('Set-Cookie', 'hs_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  ok(res, { ok: true });
}, { auth: false });

route('POST', /^\/api\/auth\/password$/, (req, res, p) => {
  try {
    changePassword(p.user.id, p.body.current, p.body.next);
    audit(p.user.id, 'password_changed');
    ok(res, { ok: true });
  } catch (e) { bad(res, e); }
});

route('GET', /^\/api\/me$/, (req, res, p) => {
  ok(res, { user: pub(p.user), profile: objColl('profiles', p.user.id), settings: objColl('settings', p.user.id), isAdmin: isAdmin(p.user) });
});

/* ---------- UNIFIED SESSION (single boot call for all roles) ---------- */
route('GET', /^\/api\/session$/, (req, res, p) => {
  const token = parseToken(p.req);
  if (!token) return ok(res, { role: null });
  const session = db.sessions.find(s => s.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) return ok(res, { role: null });
  if (session.role === 'doctor') {
    const d = db.doctorAccounts.find(x => x.id === session.userId);
    if (!d) return ok(res, { role: null });
    return ok(res, {
      role: 'doctor',
      doctor: {
        id: d.id, email: d.email, name: d.name,
        qualification: d.qualification, specialization: d.specialization,
        verificationStatus: d.verificationStatus, availabilityStatus: d.availabilityStatus,
      },
    });
  }
  if (session.role === 'store-owner') {
    const o = db.storeOwnerAccounts.find(x => x.id === session.userId);
    if (!o) return ok(res, { role: null });
    const store = db.stores.find(s => s.ownerId === o.id) || null;
    return ok(res, {
      role: 'store-owner',
      owner: { id: o.id, email: o.email, ownerName: o.ownerName, storeName: o.storeName, storeId: o.storeId },
      store,
    });
  }
  const user = db.users.find(u => u.id === session.userId);
  if (!user) return ok(res, { role: null });
  ok(res, { role: 'patient', user: pub(user), isAdmin: isAdmin(user) });
}, { auth: false });

/* ---------- UNIFIED SEARCH (federated instant results for ⌘K) ---------- */
route('GET', /^\/api\/search$/, (req, res, p) => {
  const q = String(p.query.q || '').trim().toLowerCase();
  if (q.length < 2) return ok(res, { groups: [] });
  const id = p.user.id;
  const has = (...texts) => texts.filter(Boolean).join(' ').toLowerCase().includes(q);
  const groups = [];
  const push = (key, items) => { if (items.length) groups.push({ key, items: items.slice(0, 4) }); };

  push('Reports', coll('reports', id)
    .filter(r => has(r.filename, (r.structured?.tests || []).map(t => t.name).join(' ')))
    .slice(-8).reverse()
    .map(r => ({
      type: 'report', icon: 'file-text', label: r.filename,
      sub: `${r.structured?.tests?.length || 0} values · ${String(r.uploadedAt || '').slice(0, 10)}`,
      hash: '#/reports',
    })));

  push('Family', (db.families[id] || [])
    .filter(m => has(m.name, m.relation, (m.conditions || []).map(c => c.name || c).join(' ')))
    .slice(0, 8)
    .map(m => ({
      type: 'family', icon: 'users', label: m.name || m.relation,
      sub: [m.relation, (m.conditions || []).slice(0, 2).map(c => c.name || c).join(', ')].filter(Boolean).join(' · '),
      hash: '#/family',
    })));

  push('Reminders', coll('reminders', id)
    .filter(r => has(r.title))
    .slice(0, 8)
    .map(r => ({
      type: 'reminder', icon: 'bell', label: r.title,
      sub: r.dueDate ? `Due ${r.dueDate}` : (r.status || ''),
      hash: '#/reminders',
    })));

  const seen = new Set();
  push('Metrics', coll('metrics', id)
    .filter(m => { if (seen.has(m.key)) return false; seen.add(m.key); return has(m.key, labelOf(m.key)); })
    .slice(0, 8)
    .map(m => ({ type: 'metric', icon: 'activity', label: labelOf(m.key), sub: `${m.value} ${m.unit || ''} · ${m.date}`, hash: '#/profile' })));

  push('Care team', [...coll('doctors', id).map(d => ({ n: d.name, s: d.specialty || d.role })),
    ...coll('contacts', id).map(c => ({ n: c.name, s: c.relation }))]
    .filter(x => has(x.n, x.s)).slice(0, 8)
    .map(x => ({ type: 'contact', icon: 'user', label: x.n, sub: x.s || '', hash: '#/care' })));

  ok(res, { groups });
});

/* ---------- IN-APP FEEDBACK (free alternative to forms SaaS) ---------- */
route('POST', /^\/api\/feedback$/, (req, res, p) => {
  const b = p.body || {};
  const type = ['bug', 'idea', 'praise'].includes(b.type) ? b.type : 'idea';
  const message = String(b.message || '').trim();
  if (message.length < 3) return bad(res, new Error('Please write a little more detail.'));
  if (message.length > 2000) return bad(res, new Error('Please keep feedback under 2000 characters.'));
  if (!db.feedback) db.feedback = [];
  const item = {
    id: uid('fb'), userId: p.user.id, userEmail: p.user.email, type,
    message: message.slice(0, 2000), page: String(b.page || '').slice(0, 120),
    status: 'open', ts: new Date().toISOString(),
  };
  db.feedback.push(item);
  audit(p.user.id, 'feedback_sent', `${type}: ${message.slice(0, 80)}`);
  persist();
  ok(res, { ok: true, id: item.id });
});

route('GET', /^\/api\/admin\/feedback$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, { feedback: (db.feedback || []).slice().reverse() });
});

route('DELETE', /^\/api\/admin\/feedback\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  db.feedback = (db.feedback || []).filter(f => f.id !== p.params[0]);
  persist();
  ok(res, { ok: true });
});

/* ---------- PROFILE ---------- */
route('PUT', /^\/api\/profile$/, (req, res, p) => {
  const prof = objColl('profiles', p.user.id);
  const b = p.body || {};
  for (const k of ['dob', 'sex', 'heightCm', 'weightKg', 'bloodGroup']) if (k in b) prof[k] = b[k];
  if ('allergies' in b) prof.allergies = arr(b.allergies);
  if ('conditions' in b) prof.conditions = arr(b.conditions);
  if ('medications' in b) prof.medications = typeof b.medications === 'string' ? [{ name: b.medications }] : arr(b.medications);
  if ('goals' in b) prof.goals = arr(b.goals);
  if ('foodPreference' in b) prof.foodPreference = b.foodPreference;
  if ('restrictions' in b) prof.restrictions = arr(b.restrictions);
  if (b.lifestyle) prof.lifestyle = { ...(prof.lifestyle || {}), ...b.lifestyle };
  if (!prof._createdAt) prof._createdAt = new Date().toISOString();
  // keep weight metric in sync when edited here
  if (b.weightKg && Number(b.weightKg) > 0 && !b._skipWeightMetric) addMetric(p.user.id, 'weight_kg', Number(b.weightKg), 'kg', todayISO(), 'manual');
  audit(p.user.id, 'profile_updated');
  persist();
  ok(res, { profile: prof });
});

function arr(v) {
  return Array.isArray(v) ? v : String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

/* ---------- DASHBOARD OVERVIEW ---------- */
route('GET', /^\/api\/overview$/, (req, res, p) => {
  const id = p.user.id;
  const insights = getInsights(id);
  const logs = coll('logs', id);
  const weightSeries = buildSeries(coll('metrics', id).filter(m => m.key === 'weight_kg').map(m => ({ date: m.date, value: m.value })));
  const wi = weeklyInsight(logs, weightSeries);

  const focusKeys = ['hba1c', 'bp_systolic', 'ldl', 'weight_kg'];
  const sex = objColl('profiles', id).sex;
  const metricCards = focusKeys.map(k => {
    const entries = coll('metrics', id).filter(m => m.key === k)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const lastEntry = entries.length ? entries[entries.length - 1] : null;
    return {
      key: k, label: labelOf(k),
      analysis: insights.seriesSummary[k] ? seriesFull(id, k) : null,
      lastFlag: lastEntry ? (lastEntry.flag || flagFor(k, lastEntry.value, sex)) : null,
    };
  });

  ok(res, {
    user: pub(p.user),
    profile: objColl('profiles', p.user.id),
    signalCount: insights.signals.length,
    signalSeverity: insights.signals.reduce((o, s) => {
      if (o[s.severity] !== undefined) o[s.severity] += 1;
      return o;
    }, { attention: 0, watch: 0, info: 0 }),
    topSignals: insights.signals.slice(0, 3),
    metricCards,
    recentReports: coll('reports', id).slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)).slice(0, 3)
      .map(r => ({ id: r.id, filename: r.filename, uploadedAt: r.uploadedAt, testCount: r.structured?.tests?.length || 0 })),
    upcomingReminders: coll('reminders', id).filter(r => r.status === 'active')
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 5),
    weeklyInsight: wi,
    familySignals: familySummary(id),
    careTeam: coll('doctors', id).slice(0, 2)
  });
});

function seriesFull(userId, key) {
  const entries = coll('metrics', userId).filter(m => m.key === key);
  const series = buildSeries(entries.map(e => ({ date: e.date, value: e.value })));
  const analysis = analyzeSeries(series, key);
  return { ...analysis, points: series.map(p => ({ date: p.date, value: p.value })), unit: entries[0]?.unit || '' };
}

function familySummary(userId) {
  const fam = coll('families', userId);
  const counts = {};
  for (const f of fam) for (const c of f.conditions || []) counts[normalizeCond(c.name)] = (counts[normalizeCond(c.name)] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cond, n]) => ({ cond, n }));
}
function normalizeCond(n) {
  if (/diabet/i.test(n)) return 'Diabetes';
  if (/(heart|cardiac|coronary)/i.test(n)) return 'Heart disease';
  if (/hypertension|blood pressure/i.test(n)) return 'Hypertension';
  if (/thyroid/i.test(n)) return 'Thyroid';
  if (/cholesterol/i.test(n)) return 'High cholesterol';
  if (/cancer/i.test(n)) return 'Cancer';
  return n.replace(/\s+/g, ' ').trim();
}

/* ---------- FAMILY HISTORY ---------- */
route('GET', /^\/api\/family$/, (req, res, p) => ok(res, { members: coll('families', p.user.id) }));

route('POST', /^\/api\/family$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.relation) return bad(res, new Error('Relationship is required.'));
  const m = {
    id: uid('fam'),
    relation: b.relation, name: b.name || '', ageOrYear: b.ageOrYear || '',
    conditions: Array.isArray(b.conditions) ? b.conditions : [],
    surgeries: arr(b.surgeries), cancerHistory: !!b.cancerHistory,
    geneticConditions: arr(b.geneticConditions), events: [], notes: b.notes || '',
    recordedAt: new Date().toISOString()
  };
  coll('families', p.user.id).push(m);
  audit(p.user.id, 'family_member_added', m.relation);
  persist();
  refreshAutoReminders(p.user);
  ok(res, { member: m });
});

route('PUT', /^\/api\/family\/([\w-]+)$/, (req, res, p) => {
  const m = coll('families', p.user.id).find(x => x.id === p.params[0]);
  if (!m) return bad(res, new Error('Not found'), 404);
  Object.assign(m, pick(p.body, ['relation', 'name', 'ageOrYear', 'conditions', 'surgeries', 'geneticConditions', 'notes']));
  if ('cancerHistory' in (p.body || {})) m.cancerHistory = !!p.body.cancerHistory;
  persist();
  ok(res, { member: m });
});

route('DELETE', /^\/api\/family\/([\w-]+)$/, (req, res, p) => {
  db.families[p.user.id] = coll('families', p.user.id).filter(x => x.id !== p.params[0]);
  persist();
  ok(res, { ok: true });
});

/* ---------- REPORTS ---------- */
// fileData (embedded bytes) never leaves the server except via /file.
const pubReport = r => {
  const { fileData, ...rest } = r;
  return { ...rest, fileUrl: r.storedName ? `/api/reports/${r.id}/file` : null };
};
route('GET', /^\/api\/reports$/, (req, res, p) =>
  ok(res, { reports: coll('reports', p.user.id).slice().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    .map(pubReport) }));

route('GET', /^\/api\/reports\/([\w-]+)$/, (req, res, p) => {
  const r = coll('reports', p.user.id).find(x => x.id === p.params[0]);
  if (!r) return bad(res, new Error('Report not found'), 404);
  const trendNotes = {};
  for (const t of r.structured.tests || []) trendNotes[t.key] = seriesFull(p.user.id, t.key)?.text || '';
  ok(res, { report: pubReport(r), trendNotes });
});

route('GET', /^\/api\/reports\/([\w-]+)\/file$/, async (req, res, p) => {
  const r = coll('reports', p.user.id).find(x => x.id === p.params[0]);
  if (!r?.storedName) return bad(res, new Error('File not found'), 404);
  const data = await readFile(r.storedName, r);
  if (!data) return bad(res, new Error('File missing'), 404);
  res.writeHead(200, {
    'Content-Type': r.mime || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${path.basename(r.filename)}"`,
    'Content-Length': data.buffer.length,
  });
  res.end(data.buffer);
});

route('POST', /^\/api\/reports$/, async (req, res, p) => {
  const b = p.body || {};
  if (!b.filename || !b.dataBase64) return bad(res, new Error('filename and dataBase64 are required'));
  let buffer;
  try { buffer = Buffer.from(b.dataBase64, 'base64'); } catch { return bad(res, new Error('Invalid base64 payload')); }

  const out = processDocument({ filename: b.filename, mime: b.mime || guessMime(b.filename), size: buffer.length, buffer },
    { sex: objColl('profiles', p.user.id).sex, fallbackDate: todayISO() });

  const report = {
    id: uid('rep'), filename: sanitizeName(b.filename), storedName: null, mime: b.mime || 'application/pdf',
    size: buffer.length, uploadedAt: new Date().toISOString(),
    status: out.error ? 'failed' : 'processed',
    pipeline: out.stages || [], structured: out.structured || { tests: [] }, summaryText: ''
  };

  if (out.error) { persist(); return bad(res, new Error(out.stages.at(-1).detail)); }

  // store file for PDFs/images (audit trail), not for plain text
  if (!/\.txt$/i.test(report.filename) && buffer.length <= 15 * 1024 * 1024) {
    report.storedName = `${crypto.randomBytes(6).toString('hex')}_${report.filename}`;
    const saved = await saveFile(report.storedName, buffer, report.mime);
    if (!saved) report.storedName = null;
    else {
      report.fileBackend = saved.backend;
      if (saved.backend === 'cloudinary') {
        report.cloudPublicId = saved.publicId;
        report.fileResourceType = saved.resourceType;
      }
      // Tier-2 safety copy: small files also ride inside the record so they
      // survive wherever the database survives (Vercel + Supabase Postgres).
      if (saved.backend === 'local' && shouldEmbed(buffer.length)) report.fileData = buffer.toString('base64');
    }
  }

  mergeExtractedMetrics(p.user.id, report);
  report.summaryText = explainReport(report.structured, {});
  coll('reports', p.user.id).push(report);
  audit(p.user.id, 'report_uploaded', report.filename);
  persist();
  syncAutoReminders(p.user, coll('reminders', p.user.id), getInsights(p.user.id).signals);
  persist();
  ok(res, { report: pubReport(report) });
});

route('POST', /^\/api\/reports\/manual$/, (req, res, p) => {
  const text = String(p.body?.text || '');
  if (text.trim().length < 5) return bad(res, new Error('Paste the report text first.'));
  const buffer = Buffer.from(text, 'utf8');
  const out = processDocument({ filename: 'manual-entry.txt', mime: 'text/plain', size: buffer.length, buffer },
    { sex: objColl('profiles', p.user.id).sex, fallbackDate: p.body?.date || todayISO() });
  if (out.error) return bad(res, new Error(out.stages.at(-1).detail));
  const report = {
    id: uid('rep'), filename: p.body?.filename || 'Pasted report text', storedName: null, mime: 'text/plain',
    size: buffer.length, uploadedAt: new Date().toISOString(), status: 'processed',
    pipeline: out.stages, structured: out.structured, summaryText: ''
  };
  mergeExtractedMetrics(p.user.id, report);
  report.summaryText = explainReport(report.structured, {});
  coll('reports', p.user.id).push(report);
  audit(p.user.id, 'report_manual_entry');
  persist();
  ok(res, { report });
});

route('DELETE', /^\/api\/reports\/([\w-]+)$/, async (req, res, p) => {
  const r = coll('reports', p.user.id).find(x => x.id === p.params[0]);
  if (!r) return bad(res, new Error('Not found'), 404);
  if (r.storedName) await deleteFile(r.storedName, r);
  db.reports[p.user.id] = coll('reports', p.user.id).filter(x => x.id !== p.params[0]);
  persist();
  ok(res, { ok: true });
});

/* ---------- STORAGE MANAGER (where your files live) ---------- */
route('GET', /^\/api\/storage$/, (req, res, p) => {
  const files = coll('reports', p.user.id)
    .filter(r => r.storedName)
    .map(r => ({
      id: r.id, filename: r.filename, size: r.size || 0,
      uploadedAt: r.uploadedAt, backend: locate(r),
    }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  ok(res, {
    backend: storageBackend(),
    cloudReady: storageBackend() !== 'local',
    embedMaxBytes: EMBED_MAX,
    files,
    fileCount: files.length,
    usedBytes: files.reduce((s, f) => s + (f.size || 0), 0),
  });
});

function mergeExtractedMetrics(userId, report) {
  const date = report.structured.reportDate || report.uploadedAt.slice(0, 10);
  for (const t of report.structured.tests || []) {
    const dup = coll('metrics', userId).some(m => m.key === t.key && m.date === date && Number(m.value) === t.value);
    if (!dup) coll('metrics', userId).push({
      id: uid('met'), key: t.key, value: t.value, unit: t.unit, date,
      source: `report:${report.id}`, flag: t.flag, label: `${t.name} — ${t.unit}`
    });
  }
}

function guessMime(fn) {
  if (/\.pdf$/i.test(fn)) return 'application/pdf';
  if (/\.png$/i.test(fn)) return 'image/png';
  if (/\.jpe?g$/i.test(fn)) return 'image/jpeg';
  return 'text/plain';
}
function sanitizeName(n) { return String(n).replace(/[^\w.\- ]+/g, '_').slice(0, 120); }

/* ---------- METRICS ---------- */
route('GET', /^\/api\/metrics$/, (req, res, p) => {
  const entries = coll('metrics', p.user.id).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  ok(res, { metrics: entries });
});

route('POST', /^\/api\/metrics$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.key || !Number.isFinite(Number(b.value))) return bad(res, new Error('key and numeric value required'));
  const m = addMetric(p.user.id, b.key, Number(b.value), b.unit || defaultUnit(b.key), b.date || todayISO(), 'manual');
  audit(p.user.id, 'metric_added', b.key);
  persist();
  ok(res, { metric: m });
});

route('DELETE', /^\/api\/metrics\/([\w:-]+)$/, (req, res, p) => {
  db.metrics[p.user.id] = coll('metrics', p.user.id).filter(m => m.id !== p.params[0]);
  persist();
  ok(res, { ok: true });
});

function addMetric(userId, key, value, unit, date, source) {
  const m = { id: uid('met'), key, value, unit, date: String(date).slice(0, 10), source, flag: null, label: null };
  coll('metrics', userId).push(m);
  return m;
}

const UNITS = { hba1c: '%', glucose_fasting: 'mg/dL', total_cholesterol: 'mg/dL', ldl: 'mg/dL', hdl: 'mg/dL', triglycerides: 'mg/dL', bp_systolic: 'mmHg', bp_diastolic: 'mmHg', heart_rate: 'bpm', hemoglobin: 'g/dL', weight_kg: 'kg', sleep_hours: 'h', hydration_liters: 'L', exercise_minutes: 'min', mood_score: '/5', tsh: 'µIU/mL', vitamin_d: 'ng/mL', vitamin_b12: 'pg/mL', creatinine: 'mg/dL' };
function defaultUnit(key) { return UNITS[key] || ''; }

/* ---------- TRENDS ---------- */
route('GET', /^\/api\/trends\/([\w-]+)$/, (req, res, p) => {
  const key = p.params[0];
  const entries = coll('metrics', p.user.id).filter(m => m.key === key);
  const series = buildSeries(entries.map(e => ({ date: e.date, value: e.value })));
  const analysis = analyzeSeries(series, key);
  ok(res, { key, label: labelOf(key), unit: defaultUnit(key), series, analysis });
});

/* ---------- TIMELINE ---------- */
route('GET', /^\/api\/timeline$/, (req, res, p) => {
  const events = buildTimeline({
    reports: coll('reports', p.user.id),
    metrics: coll('metrics', p.user.id),
    family: coll('families', p.user.id),
    logs: coll('logs', p.user.id),
    reminders: coll('reminders', p.user.id),
    doctors: coll('doctors', p.user.id)
  });
  let filtered = events;
  const { type, q, from, to } = p.query;
  if (type && type !== 'all') filtered = filtered.filter(e => e.type === type);
  if (q) filtered = filtered.filter(e => (e.title + ' ' + e.detail).toLowerCase().includes(q.toLowerCase()));
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  ok(res, { events: filtered.slice(0, 400), typeMeta: TYPE_META });
});

/* ---------- INSIGHTS ---------- */
route('GET', /^\/api\/insights$/, (req, res, p) => {
  refreshAutoReminders(p.user);
  ok(res, getInsights(p.user.id));
});

function refreshAutoReminders(user) {
  const before = coll('reminders', user.id).length;
  syncAutoReminders(user, coll('reminders', user.id), getInsights(user.id).signals);
  if (coll('reminders', user.id).length !== before) persist();
}

/* ---------- LIFESTYLE ---------- */
route('GET', /^\/api\/lifestyle$/, (req, res, p) => {
  const id = p.user.id;
  const plans = objColl('plans', id);
  const logs = coll('logs', id);
  const weightSeries = buildSeries(coll('metrics', id).filter(m => m.key === 'weight_kg').map(m => ({ date: m.date, value: m.value })));
  ok(res, {
    plans: { activity: plans.activity || null, nutrition: plans.nutrition || null },
    weeklyInsight: weeklyInsight(logs, weightSeries),
    logs: logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60)
  });
});

route('POST', /^\/api\/lifestyle\/regenerate$/, (req, res, p) => {
  const ctxProfile = objColl('profiles', p.user.id);
  const signals = getInsights(p.user.id).signals;
  db.plans[p.user.id] = {
    activity: generateActivityPlan(ctxProfile, signals),
    nutrition: generateNutritionPlan(ctxProfile, signals)
  };
  audit(p.user.id, 'lifestyle_plan_regenerated');
  persist();
  ok(res, { plans: db.plans[p.user.id] });
});

route('POST', /^\/api\/lifestyle\/logs$/, (req, res, p) => {
  const b = p.body || {};
  const valid = ['exercise_minutes', 'sleep_hours', 'hydration_liters', 'mood_score'];
  if (!valid.includes(b.type) || !Number.isFinite(Number(b.value))) return bad(res, new Error(`type must be one of ${valid.join(', ')}`));
  const log = { id: uid('log'), type: b.type, value: Number(b.value), date: b.date || todayISO() };
  coll('logs', p.user.id).push(log);
  persist();
  ok(res, { log });
});

/* ---------- NUTRITION PLAN EDITING ---------- */
route('POST', /^\/api\/lifestyle\/nutrition\/edit$/, (req, res, p) => {
  const b = p.body || {};
  const plans = objColl('plans', p.user.id);
  const nut = plans.nutrition;
  if (!nut) return bad(res, new Error('No nutrition plan yet. Generate one first.'));
  const dayIndex = Number(b.dayIndex);
  const slot = b.slot; // 'breakfast', 'lunch', 'dinner', 'snacks'
  const newName = String(b.name || '').trim();
  const newKcal = String(b.kcal || '').trim();
  if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return bad(res, new Error('dayIndex must be 0-6.'));
  if (!['breakfast', 'lunch', 'dinner', 'snacks'].includes(slot)) return bad(res, new Error('slot must be breakfast, lunch, dinner, or snacks.'));
  if (!newName) return bad(res, new Error('Meal name is required.'));
  const day = nut.weekPlan[dayIndex];
  if (!day) return bad(res, new Error('Invalid day index.'));
  if (slot === 'snacks') {
    day.snacks = newName;
  } else {
    day[slot] = [newName, newKcal || ''];
  }
  nut.editedByUser = true;
  nut.lastEditedAt = new Date().toISOString();
  audit(p.user.id, 'nutrition_meal_edited', `${day.day} ${slot}`);
  persist();
  ok(res, { weekPlan: nut.weekPlan });
});

route('POST', /^\/api\/lifestyle\/nutrition\/swap$/, (req, res, p) => {
  const b = p.body || {};
  const plans = objColl('plans', p.user.id);
  const nut = plans.nutrition;
  if (!nut) return bad(res, new Error('No nutrition plan yet.'));
  const dayIndex = Number(b.dayIndex);
  const slot = b.slot;
  const withIndex = Number(b.withIndex);
  if (!Number.isFinite(dayIndex) || !Number.isFinite(withIndex)) return bad(res, new Error('dayIndex and withIndex required.'));
  if (!['breakfast', 'lunch', 'dinner'].includes(slot)) return bad(res, new Error('slot must be breakfast, lunch, or dinner.'));
  const pref = nut.preference || 'vegetarian';
  const menu = MEALS[pref] || MEALS.vegetarian;
  const pool = menu[slot] || [];
  if (withIndex < 0 || withIndex >= pool.length) return bad(res, new Error('Invalid swap index.'));
  const day = nut.weekPlan[dayIndex];
  if (!day) return bad(res, new Error('Invalid day index.'));
  const alternative = pool[withIndex];
  if (!alternative) return bad(res, new Error('Alternative not found.'));
  day[slot] = [alternative[0].replace(/\b\w/g, c => c.toUpperCase()), alternative[1]];
  nut.editedByUser = true;
  nut.lastEditedAt = new Date().toISOString();
  audit(p.user.id, 'nutrition_meal_swapped', `${day.day} ${slot}`);
  persist();
  ok(res, { meal: day[slot], weekPlan: nut.weekPlan });
});

route('GET', /^\/api\/lifestyle\/nutrition\/alternatives$/, (req, res, p) => {
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams);
  const plans = objColl('plans', p.user.id);
  const nut = plans.nutrition;
  if (!nut) return bad(res, new Error('No nutrition plan yet.'));
  const slot = q.slot || 'breakfast';
  const dayIndex = Number(q.dayIndex) || 0;
  const pref = nut.preference || 'vegetarian';
  const day = nut.weekPlan[dayIndex];
  const currentName = day && day[slot] && Array.isArray(day[slot]) ? day[slot][0] : '';
  const menu = MEALS[pref] || MEALS.vegetarian;
  const pool = menu[slot] || [];
  const alts = pool
    .map(([name, kcal], idx) => ({ name: name.replace(/\b\w/g, c => c.toUpperCase()), kcal, _poolIndex: idx }))
    .filter(a => a.name.toLowerCase() !== (currentName || '').toLowerCase());
  ok(res, { alternatives: alts, slot, dayIndex });
});

route('POST', /^\/api\/lifestyle\/nutrition\/regenerate-day$/, (req, res, p) => {
  const b = p.body || {};
  const plans = objColl('plans', p.user.id);
  const nut = plans.nutrition;
  if (!nut) return bad(res, new Error('No nutrition plan yet.'));
  const dayIndex = Number(b.dayIndex);
  if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return bad(res, new Error('dayIndex must be 0-6.'));
  const ctxProfile = objColl('profiles', p.user.id);
  const signals = getInsights(p.user.id).signals;
  const newPlan = generateNutritionPlan(ctxProfile, signals);
  nut.weekPlan[dayIndex] = newPlan.weekPlan[dayIndex];
  nut.editedByUser = true;
  nut.lastEditedAt = new Date().toISOString();
  audit(p.user.id, 'nutrition_day_regenerated', nut.weekPlan[dayIndex].day);
  persist();
  ok(res, { day: nut.weekPlan[dayIndex] });
});

/* ---------- REMINDERS ---------- */
route('GET', /^\/api\/reminders$/, (req, res, p) => {
  const list = coll('reminders', p.user.id).slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  ok(res, { reminders: list });
});

route('POST', /^\/api\/reminders$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.title) return bad(res, new Error('Title is required.'));
  const r = createReminder(p.user.id, b);
  coll('reminders', p.user.id).push(r);
  persist();
  ok(res, { reminder: r });
});

route('POST', /^\/api\/reminders\/([\w-]+)\/action$/, (req, res, p) => {
  const r = coll('reminders', p.user.id).find(x => x.id === p.params[0]);
  if (!r) return bad(res, new Error('Not found'), 404);
  try {
    reminderAction(r, p.body.action, p.body);
    audit(p.user.id, `reminder_${p.body.action}`, r.title);
    persist();
    ok(res, { reminder: r });
  } catch (e) { bad(res, e); }
});

/* ---------- CARE TEAM & EMERGENCY CONTACTS ---------- */
route('GET', /^\/api\/care$/, (req, res, p) =>
  ok(res, { doctors: coll('doctors', p.user.id), contacts: coll('contacts', p.user.id).sort((a, b) => (a.priority || 9) - (b.priority || 9)) }));

route('POST', /^\/api\/doctors$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.name) return bad(res, new Error('Name is required.'));
  const d = { id: uid('doc'), name: b.name, role: b.role || 'Specialist', specialty: b.specialty || '', phone: b.phone || '', clinic: b.clinic || '', notes: b.notes || '', addedAt: new Date().toISOString() };
  coll('doctors', p.user.id).push(d);
  persist();
  ok(res, { doctor: d });
});
route('DELETE', /^\/api\/doctors\/([\w-]+)$/, (req, res, p) => {
  db.doctors[p.user.id] = coll('doctors', p.user.id).filter(d => d.id !== p.params[0]); persist(); ok(res, { ok: true });
});

route('POST', /^\/api\/contacts$/, (req, res, p) => {
  const b = p.body || {};
  if (!b.name || !b.phone) return bad(res, new Error('Name and phone are required.'));
  const c = { id: uid('ct'), name: b.name, relation: b.relation || 'Other', phone: b.phone, notes: b.notes || '', priority: Math.max(1, Math.min(5, Number(b.priority) || 2)) };
  coll('contacts', p.user.id).push(c);
  persist();
  ok(res, { contact: c });
});
route('DELETE', /^\/api\/contacts\/([\w-]+)$/, (req, res, p) => {
  db.contacts[p.user.id] = coll('contacts', p.user.id).filter(c => c.id !== p.params[0]); persist(); ok(res, { ok: true });
});

/* Consent-gated contact import simulation (PRD 8.17) */
route('POST', /^\/api\/contacts\/import$/, (req, res, p) => {
  const s = objColl('settings', p.user.id);
  s.consents = { contactsImport: false, location: false, shareReports: false, familyView: false, ...(s.consents || {}) };
  if (!p.body?.confirm) return bad(res, new Error('Explicit confirmation required to import contacts.'), 403);
  s.consents.contactsImport = true;
  const demoDeviceContacts = [
    { name: 'Suresh Mehta', relation: 'Father', phone: '+91 98200 77889' },
    { name: 'Nirmala Mehta', relation: 'Mother', phone: '+91 98200 99001' }
  ];
  const added = [];
  for (const c of demoDeviceContacts) {
    if (coll('contacts', p.user.id).some(x => x.phone === c.phone)) continue;
    const entry = { id: uid('ct'), ...c, notes: 'Imported from device contacts', priority: 1 };
    coll('contacts', p.user.id).push(entry); added.push(entry);
  }
  audit(p.user.id, 'contacts_imported', `${added.length} contact(s)`);
  persist();
  ok(res, { added, consentRecord: { scope: 'device_contacts', ts: new Date().toISOString() } });
});

/* ---------- HOSPITALS ---------- */
route('GET', /^\/api\/hospitals$/, async (req, res, p) => {
  const q = p.query;
  const lat = q.lat ? parseFloat(q.lat) : null;
  const lng = q.lng ? parseFloat(q.lng) : null;
  const type = q.type || 'all';
  const searchQ = q.q || '';

  // Live OpenStreetMap discovery around real coordinates
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const facilities = await fetchNearbyLive({ lat, lng, type, q: searchQ });
      return ok(res, {
        cities: CITIES.map(c => c.name),
        source: 'live',
        origin: { lat, lng },
        radiusKm: 6,
        facilities
      });
    } catch {
      const facilities = searchFacilities({ lat, lng, city: q.city, type, q: searchQ });
      return ok(res, { cities: CITIES.map(c => c.name), source: 'sample', origin: { lat, lng }, facilities });
    }
  }

  // Geocoded place search ("any city or locality")
  if (q.place) {
    try {
      const g = await geocodePlace(q.place);
      try {
        const facilities = await fetchNearbyLive({ lat: g.lat, lng: g.lng, type, q: searchQ });
        return ok(res, { cities: CITIES.map(c => c.name), source: 'live', origin: g, radiusKm: 6, facilities });
      } catch {
        const facilities = searchFacilities({ lat: g.lat, lng: g.lng, city: q.city, type, q: searchQ });
        return ok(res, { cities: CITIES.map(c => c.name), source: 'sample', origin: g, facilities });
      }
    } catch (e) {
      return ok(res, { cities: CITIES.map(c => c.name), source: 'error', error: e.message || 'Place not found', facilities: [] });
    }
  }

  // Offline sample dataset (city browse)
  ok(res, {
    cities: CITIES.map(c => c.name),
    source: 'sample',
    facilities: searchFacilities({ lat, lng, city: q.city, type, q: searchQ })
  });
});

/* ---------- EMERGENCY ---------- */
route('GET', /^\/api\/emergency$/, (req, res, p) => {
  audit(p.user.id, 'emergency_card_accessed');
  ok(res, emergencyCard(p.user.id));
});

/* ---------- EMERGENCY SOS ----------
   Notification aid, not a life-safety service: records an alert, builds a
   shareable message (+location link when permitted), and hands the client
   the primary contact so it can open sms:/WhatsApp. Never auto-sends. */
function primaryContactOf(id) {
  return coll('contacts', id).slice().sort((a, b) => (a.priority || 3) - (b.priority || 3))[0] || null;
}
route('GET', /^\/api\/sos$/, (req, res, p) => {
  ok(res, {
    alerts: coll('sos', p.user.id).slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)),
    primaryContact: primaryContactOf(p.user.id)
  });
});
route('POST', /^\/api\/sos$/, (req, res, p) => {
  const b = p.body || {};
  let locLink = '';
  if (Number.isFinite(+b.lat) && Number.isFinite(+b.lng)) {
    locLink = `https://maps.google.com/?q=${+b.lat},${+b.lng}`;
  }
  const alert = {
    id: uid('sos'),
    ts: new Date().toISOString(),
    status: 'active',
    hasLocation: !!locLink,
    message: `EMERGENCY ALERT — ${p.user.name} needs urgent help. Please attempt to reach them and send help to their last known location.${locLink ? ' Location: ' + locLink : ''}`
  };
  coll('sos', p.user.id).push(alert);
  audit(p.user.id, 'sos_triggered', locLink ? 'with location' : 'without location');
  persist();
  ok(res, { alert, primaryContact: primaryContactOf(p.user.id) });
});
route('POST', /^\/api\/sos\/([\w-]+)\/cancel$/, (req, res, p) => {
  const a = coll('sos', p.user.id).find(x => x.id === p.params[0]);
  if (!a) return bad(res, new Error('Alert not found.'), 404);
  if (a.status !== 'active') return bad(res, new Error('Alert is not active.'));
  a.status = 'cancelled';
  a.cancelledAt = new Date().toISOString();
  audit(p.user.id, 'sos_cancelled', a.id);
  persist();
  ok(res, { alert: a });
});

/* ---------- AI ASSISTANT (rule-based, reads only this user's records) ---------- */
route('POST', /^\/api\/assistant$/, (req, res, p) => {
  const q = String(p.body?.q || '').slice(0, 300);
  ok(res, { answer: askAssistant(p.user.id, q) });
});

/* ---------- SETTINGS / PRIVACY / DATA RIGHTS ---------- */
route('PUT', /^\/api\/settings$/, (req, res, p) => {
  const s = objColl('settings', p.user.id);
  const b = p.body || {};
  if (b.consents) s.consents = { ...(s.consents || {}), ...b.consents };
  if (b.notifications) s.notifications = { ...(s.notifications || {}), ...b.notifications };
  if (b.privacy) s.privacy = { ...(s.privacy || {}), ...b.privacy };
  audit(p.user.id, 'settings_updated', Object.keys(b).join(','));
  persist();
  ok(res, { settings: s });
});

route('GET', /^\/api\/export$/, (req, res, p) => {
  const dump = {
    exportedAt: new Date().toISOString(),
    account: pub(p.user),
    profile: objColl('profiles', p.user.id),
    familyHistory: coll('families', p.user.id),
    medicalReports: coll('reports', p.user.id),
    healthMetrics: coll('metrics', p.user.id),
    lifestyleLogs: coll('logs', p.user.id),
    plans: objColl('plans', p.user.id),
    doctors: coll('doctors', p.user.id),
    emergencyContacts: coll('contacts', p.user.id),
    reminders: coll('reminders', p.user.id),
    consentsAndSettings: objColl('settings', p.user.id)
  };
  audit(p.user.id, 'data_exported');
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="HealthSphere-export-${todayISO()}.json"`,
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(dump, null, 2));
});

route('GET', /^\/api\/audit$/, (req, res, p) => ok(res, { audit: (db.audit[p.user.id] || []).slice(-100).reverse() }));

route('DELETE', /^\/api\/account$/, (req, res, p) => {
  const id = p.user.id;
  for (const k of ['users']) db[k] = db[k].filter(u => u.id !== id);
  db.sessions = db.sessions.filter(s => s.userId !== id);
  delete db.profiles[id]; delete db.families[id]; delete db.reports[id]; delete db.metrics[id];
  delete db.logs[id]; delete db.plans[id]; delete db.doctors[id]; delete db.contacts[id];
  delete db.reminders[id]; delete db.settings[id]; delete db.audit[id];
  persist();
  res.setHeader('Set-Cookie', 'hs_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  ok(res, { ok: true, message: 'Account and all associated data deleted.' });
});

/* ---------------- ADMIN PANEL ----------------
   Read-heavy oversight endpoints. Every route re-checks isAdmin() —
   membership is controlled by ADMIN_EMAILS (see lib/auth.js). */
function adminOnly(res, p) {
  if (!isAdmin(p.user)) { bad(res, new Error('Admin access required.'), 403); return false; }
  return true;
}

const sumLen = obj => Object.values(obj || {}).reduce((n, a) => n + (a?.length || 0), 0);
function lastLoginTs(id) {
  const logins = (db.audit[id] || []).filter(a => a.action === 'login');
  return logins.length ? logins[logins.length - 1].ts : null;
}
function userCounts(id) {
  return {
    familyMembers: (db.families[id] || []).length,
    reports: (db.reports[id] || []).length,
    metrics: (db.metrics[id] || []).length,
    lifestyleLogs: (db.logs[id] || []).length,
    doctors: (db.doctors[id] || []).length,
    contacts: (db.contacts[id] || []).length,
    reminders: (db.reminders[id] || []).length,
    auditEvents: (db.audit[id] || []).length
  };
}

route('GET', /^\/api\/admin\/overview$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, {
    stats: {
      users: db.users.length,
      activeSessions: db.sessions.filter(s => new Date(s.expiresAt) > new Date()).length,
      reports: sumLen(db.reports),
      metrics: sumLen(db.metrics),
      lifestyleLogs: sumLen(db.logs),
      reminders: sumLen(db.reminders),
      careTeamEntries: sumLen(db.doctors) + sumLen(db.contacts),
      auditEvents: sumLen(db.audit)
    },
    storage: { mode: storageMode(), dataDir: DATA_DIR, fileStorage: storageBackend() },
    runtime: { node: process.version, uptimeSec: Math.round(process.uptime()) },
    recentUsers: db.users.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5)
      .map(u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }))
  });
});

route('GET', /^\/api\/admin\/users$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, {
    users: db.users.map(u => ({
      id: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
      lastLogin: lastLoginTs(u.id), isAdmin: isAdmin(u), counts: userCounts(u.id)
    })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  });
});

route('GET', /^\/api\/admin\/users\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const u = db.users.find(x => x.id === p.params[0]);
  if (!u) return bad(res, new Error('User not found.'), 404);
  ok(res, {
    user: pub(u),
    counts: userCounts(u.id),
    profile: db.profiles[u.id] || {},
    settings: db.settings[u.id] || {},
    familyHistory: db.families[u.id] || [],
    reports: (db.reports[u.id] || []).map(pubReport),
    metrics: db.metrics[u.id] || [],
    lifestyleLogs: db.logs[u.id] || [],
    plans: db.plans[u.id] || {},
    doctors: db.doctors[u.id] || [],
    contacts: db.contacts[u.id] || [],
    reminders: db.reminders[u.id] || [],
    audit: (db.audit[u.id] || []).slice(-100).reverse()
  });
});

route('DELETE', /^\/api\/admin\/users\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const id = p.params[0];
  if (id === p.user.id) return bad(res, new Error('Use Settings → Delete account to remove your own account.'), 400);
  const u = db.users.find(x => x.id === id);
  if (!u) return bad(res, new Error('User not found.'), 404);
  db.users = db.users.filter(x => x.id !== id);
  db.sessions = db.sessions.filter(s => s.userId !== id);
  for (const k of ['profiles', 'families', 'reports', 'metrics', 'logs', 'plans', 'doctors', 'contacts', 'reminders', 'settings', 'audit']) delete db[k][id];
  audit(p.user.id, 'admin_deleted_user', `${u.email} (${id})`);
  persist();
  ok(res, { ok: true, message: `Deleted ${u.email} and all associated data.` });
});

route('GET', /^\/api\/admin\/audit$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const byEmail = Object.fromEntries(db.users.map(u => [u.id, u.email]));
  const all = [];
  for (const [id, list] of Object.entries(db.audit)) {
    for (const a of list) all.push({ ...a, userEmail: byEmail[id] || id });
  }
  all.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  ok(res, { audit: all.slice(0, 150), totalTracked: all.length });
});

/* ---------------- helpers ---------------- */
function pub(u) { return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt }; }
function pick(obj, keys) { const o = {}; if (!obj) return o; for (const k of keys) if (k in obj) o[k] = obj[k]; return o; }
function initUserData(userId) {
  objColl('profiles', userId);
  objColl('settings', userId).consents = { contactsImport: false, location: false, shareReports: false, familyView: false };
  objColl('settings', userId).notifications = { health: true, lifestyle: true, healthcare: true, emergency: true };
  persist();
}
function setAuth(res, token) {
  res.setHeader('Set-Cookie', `hs_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
}

/* ---------------- dispatcher ---------------- */
export async function handleApi(req, res, pathname, query, body) {
  // Check main routes first
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const params = m.slice(1);
    const needsAuth = r.opts.auth !== false;
    const user = getAuthedUser(req);
    if (needsAuth && !user) { send(res, 401, { error: 'Please sign in.' }); return true; }
    try {
      await r.handler(req, res, { params, query, body, user, req });
    } catch (e) {
      console.error('[api]', e);
      bad(res, e, 500);
    }
    return true;
  }

  // Check doctor routes
  for (const r of doctorRoutes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    try {
      await r.handler(req, res, { params: m.slice(1), query, body, req });
    } catch (e) {
      console.error('[api-doctor]', e);
      bad(res, e, 500);
    }
    return true;
  }

  // Check store routes
  for (const r of storeRoutes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    try {
      await r.handler(req, res, { params: m.slice(1), query, body, req });
    } catch (e) {
      console.error('[api-store]', e);
      bad(res, e, 500);
    }
    return true;
  }

  // Check consultation routes (patient-facing)
  for (const r of consultRoutes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const user = getAuthedUser(req);
    if (!user) { send(res, 401, { error: 'Please sign in.' }); return true; }
    try {
      await r.handler(req, res, { params: m.slice(1), query, body, user, req });
    } catch (e) {
      console.error('[api-consult]', e);
      bad(res, e, 500);
    }
    return true;
  }

  // Check extended admin routes
  for (const r of admin2Routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const user = getAuthedUser(req);
    try {
      await r.handler(req, res, { params: m.slice(1), query, body, user, req });
    } catch (e) {
      console.error('[api-admin2]', e);
      bad(res, e, 500);
    }
    return true;
  }

  return false;
}
