import assert from 'node:assert';
import './_testenv.mjs';
import { computeSignals, safetySanitize } from '../lib/rules.js';
import { recommendSpecialists, screeningChecklist } from '../lib/recommend.js';
import { buildContext } from '../lib/insights.js';
import { objColl, coll } from '../lib/db.js';
import { registerUser } from '../lib/auth.js';

// Build the PRD §19 scenario against the real engine
let uid;

objColl('profiles', uid);
Object.assign(objColl('profiles', uid), {
  dob: '1988-04-12', sex: 'male', heightCm: 172, weightKg: 82,
  lifestyle: { activityLevel: 'light', smoking: 'never' }
});
coll('families', uid).push(
  { relation: 'Grandfather', conditions: [{ name: 'Type 2 Diabetes', diagAge: 62 }] },
  { relation: 'Father', conditions: [{ name: 'Hypertension', diagAge: 48 }] }
);
coll('metrics', uid).push(
  { key: 'hba1c', value: 5.4, unit: '%', date: '2024-03-15' },
  { key: 'hba1c', value: 5.7, unit: '%', date: '2025-02-10' },
  { key: 'hba1c', value: 6.0, unit: '%', date: '2026-08-20' },
  { key: 'bp_systolic', value: 138, unit: 'mmHg', date: '2026-07-22' },
  { key: 'bp_diastolic', value: 88, unit: 'mmHg', date: '2026-07-22' },
  { key: 'ldl', value: 131, unit: 'mg/dL', date: '2026-08-20' },
  { key: 'vitamin_d', value: 18, unit: 'ng/mL', date: '2026-08-20' }
);

const ctx = buildContext(uid);
const signals = computeSignals(ctx);
const metabolic = signals.find(s => s.id === 'metabolic');
assert.ok(metabolic, 'metabolic signal present');
assert.ok(metabolic.factors.some(f => /HbA1c/i.test(f)), 'hba1c factor cited');
assert.ok(metabolic.factors.some(f => /Grandfather/.test(f)), 'family history factor cited');
assert.equal(metabolic.severity, 'attention', 'attention severity given hba1c>=6 + family history');

const cardio = signals.find(s => s.id === 'cardio');
assert.ok(cardio, 'cardio signal present');
assert.ok(cardio.factors.some(f => /138/.test(f)), 'bp factor cited');

// safety layer
const safe = safetySanitize(signals);
for (const s of safe.signals) {
  const blob = JSON.stringify(s).toLowerCase();
  assert.ok(!/\bdiagnos/.test(blob), 'no diagnosis language after safety layer');
  assert.ok(s.factors.length > 0, 'explainability preserved');
}
assert.ok(Array.isArray(safe.disclaimers) && safe.disclaimers.length >= 2, 'disclaimers attached');

// specialists
const specs = recommendSpecialists(safe.signals);
assert.ok(specs.some(s => /Endocrinology/.test(s.specialty)), 'endocrinology suggested for metabolic');
assert.ok(specs.some(s => /Cardiology/.test(s.specialty)), 'cardiology suggested for cardio');

// screening
const scr = screeningChecklist(ctx.profile, ctx.family, ctx.series, ctx.latest);
assert.ok(scr.length >= 3, 'screening checklist populated');
assert.ok(scr.every(s => /doctor|guidance|advice/i.test(s.recommendedReview)), 'screening framed as doctor discussion');

console.log('[PASS] rules.test.mjs — risk signals, safety layer, recommendations OK');
