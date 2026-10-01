import { coll, objColl, db } from './db.js';
import { buildSeries, analyzeSeries } from './trends.js';
import { computeSignals, safetySanitize } from './rules.js';
import { recommendSpecialists, screeningChecklist } from './recommend.js';

/* ---------------- Health intelligence aggregation ---------------- */

const TRACKED_KEYS = [
  'weight_kg', 'bmi', 'hba1c', 'glucose_fasting', 'glucose_random',
  'total_cholesterol', 'ldl', 'hdl', 'triglycerides',
  'bp_systolic', 'bp_diastolic', 'heart_rate', 'hemoglobin',
  'creatinine', 'urea', 'egfr', 'uric_acid', 'alt', 'ast',
  'bilirubin_total', 'tsh', 'vitamin_d', 'vitamin_b12', 'sodium', 'potassium'
];

export function buildContext(userId) {
  const profile = objColl('profiles', userId);
  const family = coll('families', userId);
  const metrics = coll('metrics', userId);

  const seriesMap = {};
  const latestMap = {};
  for (const key of TRACKED_KEYS) {
    const entries = metrics.filter(m => m.key === key);
    if (!entries.length) continue;
    const series = buildSeries(entries.map(e => ({ date: e.date, value: e.value })));
    // attach flags onto series points when available
    for (const p of series) {
      const match = entries.filter(e => String(e.date).slice(0, 10) === p.date && Number(e.value) === p.value)[0];
      if (match) p.flag = match.flag;
    }
    seriesMap[key] = analyzeSeries(series, key);
    latestMap[key] = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }
  latestMap._bpList = metrics.filter(m => m.key === 'bp_systolic').map(m => ({ value: Number(m.value) }));

  const cutoff = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const exMin = coll('logs', userId).filter(l => l.type === 'exercise_minutes' && l.date >= cutoff);
  latestMap._exerciseAvg = exMin.length ? exMin.reduce((a, b) => a + Number(b.value), 0) / 4 : null;

  return {
    profile,
    family,
    series: seriesMap,
    latest: latestMap
  };
}

export function getInsights(userId) {
  const ctx = buildContext(userId);
  const raw = computeSignals(ctx);
  const safe = safetySanitize(raw);
  return {
    generatedAt: new Date().toISOString(),
    signals: safe.signals,
    disclaimers: safe.disclaimers,
    specialists: recommendSpecialists(safe.signals),
    screening: screeningChecklist(ctx.profile, ctx.family, ctx.series, ctx.latest),
    seriesSummary: Object.fromEntries(Object.entries(ctx.series).map(([k, v]) => [k, {
      label: v.last ? `${k}` : k, direction: v.direction || 'no_data',
      last: v.last, n: v.n, stale: !!v.stale, anomaly: !!v.anomaly, repeatedAbnormal: !!v.repeatedAbnormal
    }]))
  };
}

export function emergencyCard(userId) {
  const profile = objColl('profiles', userId);
  const contacts = coll('contacts', userId).slice().sort((a, b) => (a.priority || 9) - (b.priority || 9));
  const doctor = coll('doctors', userId).find(d => d.role === 'Family Doctor') || coll('doctors', userId)[0] || null;
  return {
    name: db.users.find(u => u.id === userId)?.name || '',
    bloodGroup: profile.bloodGroup || '',
    allergies: profile.allergies || [],
    conditions: profile.conditions || [],
    medications: profile.medications || [],
    dob: profile.dob || '',
    contacts,
    doctor
  };
}
