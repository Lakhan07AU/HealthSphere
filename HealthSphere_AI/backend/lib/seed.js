import { db, coll, objColl, persist } from './db.js';
import { registerUser } from './auth.js';
import { processDocument } from './extraction.js';
import { uid, addDays, todayISO } from './util.js';
import { getInsights } from './insights.js';
import { createReminder, syncAutoReminders } from './reminders.js';
import { generateActivityPlan, generateNutritionPlan } from './lifestyle.js';

/* ---------------- Demo seed: PRD §19 end-to-end scenario ----------------
   Arjun uploads reports over the years; HbA1c climbs 5.4 → 5.7 → 6.0,
   family history adds context, engine produces explainable guidance. */

const REPORT_2025 = `Metro Diagnostics Laboratory
Patient: Arjun Mehta        Report Date: 10 Feb 2025
=== HEALTH CHECK PANEL ===
HbA1c  5.7 %
Fasting Blood Glucose 104 mg/dL
Total Cholesterol 210 mg/dL
LDL Cholesterol 126 mg/dL
HDL Cholesterol 44 mg/dL
Triglycerides 142 mg/dL
Creatinine 0.9 mg/dL
TSH 2.3 uIU/mL`;

const REPORT_2026 = `Genome Health Laboratory
Patient Name: Arjun Mehta
Report Date: 20 Aug 2026
--- METABOLIC & LIPID PANEL ---
HbA1c : 6.0 %
Fasting Blood Glucose : 112 mg/dL
Total Cholesterol : 218 mg/dL
LDL : 131 mg/dL
HDL : 42 mg/dL
Triglycerides : 158 mg/dL
Vitamin D (25-OH) : 18 ng/mL
Blood Pressure : 138/88
Please consult your physician for interpretation.`;

export function ensureSeed() {
  if (db.users.length) return;
  const user = registerUser({ name: 'Arjun Mehta', email: 'demo@HealthSphere.ai', password: 'demo1234' });
  const id = user.id;

  objColl('profiles', id);
  Object.assign(objColl('profiles', id), {
    dob: '1988-04-12', sex: 'male', heightCm: 172, weightKg: 78,
    bloodGroup: 'A+', allergies: ['Penicillin'], conditions: ['Prehypertension'],
    medications: [{ name: 'None recorded' }],
    lifestyle: { activityLevel: 'light', smoking: 'never', alcohol: 'occasional', sleepHours: 6.5, dietPreference: 'vegetarian' },
    foodPreference: 'vegetarian', restrictions: [],
    goals: ['Improve stamina', 'Better sleep', 'Maintain healthy weight']
  });

  const fam = [
    { relation: 'Grandfather', name: 'Ramesh Mehta', ageOrYear: '~84', conditions: [{ name: 'Type 2 Diabetes', diagAge: 62 }, { name: 'Hypertension', diagAge: 58 }] },
    { relation: 'Father', name: 'Suresh Mehta', ageOrYear: '61', conditions: [{ name: 'Hypertension', diagAge: 48 }, { name: 'High cholesterol', diagAge: 52 }] },
    { relation: 'Mother', name: 'Nirmala Mehta', ageOrYear: '58', conditions: [{ name: 'Hypothyroidism', diagAge: 45 }] },
    { relation: 'Uncle', name: 'Mahesh Mehta', ageOrYear: '57', conditions: [{ name: 'Type 2 Diabetes', diagAge: 55 }] },
    { relation: 'Sister', name: 'Priya Shah', ageOrYear: '33', conditions: [] }
  ].map((f, i) => ({ id: uid('fam'), ...f, surgeries: [], cancerHistory: false, geneticConditions: [], events: [], notes: '', recordedAt: new Date(Date.now() - (i + 3) * 86400000).toISOString() }));
  db.families[id] = fam;

  // ---- metrics history (incl. report-sourced values) ----
  const M = (key, value, unit, date, source = 'manual', flag) => ({ id: uid('met'), key, value, unit, date, source, flag, label: null });
  db.metrics[id] = [
    M('weight_kg', 82, 'kg', '2024-01-15'), M('weight_kg', 80.5, 'kg', '2024-09-02'),
    M('weight_kg', 79.5, 'kg', '2025-05-11'), M('weight_kg', 78.8, 'kg', '2026-01-20'), M('weight_kg', 78, 'kg', '2026-08-01'),
    M('hba1c', 5.4, '%', '2024-03-15'), M('hba1c', 5.7, '%', '2025-02-10', 'report'), M('hba1c', 6.0, '%', '2026-08-20', 'report'),
    M('glucose_fasting', 98, 'mg/dL', '2024-03-15'), M('glucose_fasting', 104, 'mg/dL', '2025-02-10', 'report'),
    M('glucose_fasting', 112, 'mg/dL', '2026-08-20', 'report'),
    M('total_cholesterol', 205, 'mg/dL', '2024-12-06'), M('total_cholesterol', 210, 'mg/dL', '2025-02-10', 'report'),
    M('total_cholesterol', 218, 'mg/dL', '2026-08-20', 'report'),
    M('ldl', 118, 'mg/dL', '2024-12-06'), M('ldl', 126, 'mg/dL', '2025-02-10', 'report'), M('ldl', 131, 'mg/dL', '2026-08-20', 'report'),
    M('hdl', 46, 'mg/dL', '2024-12-06'), M('hdl', 44, 'mg/dL', '2025-02-10', 'report'), M('hdl', 42, 'mg/dL', '2026-08-20', 'report'),
    M('triglycerides', 138, 'mg/dL', '2024-12-06'), M('triglycerides', 142, 'mg/dL', '2025-02-10', 'report'),
    M('triglycerides', 158, 'mg/dL', '2026-08-20', 'report'),
    M('bp_systolic', 128, 'mmHg', '2024-11-18'), M('bp_systolic', 130, 'mmHg', '2025-06-14'),
    M('bp_systolic', 134, 'mmHg', '2025-12-09'), M('bp_systolic', 138, 'mmHg', '2026-07-22'),
    M('bp_diastolic', 84, 'mmHg', '2024-11-18'), M('bp_diastolic', 85, 'mmHg', '2025-06-14'),
    M('bp_diastolic', 86, 'mmHg', '2025-12-09'), M('bp_diastolic', 88, 'mmHg', '2026-07-22'),
    M('heart_rate', 74, 'bpm', '2026-07-22'),
    M('tsh', 2.3, 'µIU/mL', '2025-02-10', 'report'), M('tsh', 2.1, 'µIU/mL', '2026-03-30'),
    M('hemoglobin', 14.2, 'g/dL', '2026-03-30'),
    M('vitamin_d', 18, 'ng/mL', '2026-08-20', 'report'),
    M('creatinine', 0.9, 'mg/dL', '2025-02-10', 'report')
  ];

  // ---- processed reports via the real pipeline ----
  const mkReport = (filename, text, uploadedAt) => {
    const buffer = Buffer.from(text, 'utf8');
    const out = processDocument({ filename, mime: 'text/plain', size: buffer.length, buffer }, { sex: 'male' });
    return {
      id: uid('rep'), filename, storedName: null, mime: 'text/plain', size: buffer.length,
      uploadedAt, status: 'processed',
      pipeline: out.stages, structured: out.structured,
      summaryText: null
    };
  };
  db.reports[id] = [mkReport('health-check-2025.txt', REPORT_2025, '2025-02-12T09:20:00.000Z')];
  const rep26 = mkReport('metabolic-panel-aug2026.txt', REPORT_2026, '2026-08-21T07:45:00.000Z');
  db.reports[id].push(rep26);

  // ---- lifestyle logs (last ~16 days) ----
  const logs = [];
  for (let d = 16; d >= 1; d--) {
    const date = addDays(todayISO(), -d);
    logs.push(
      { id: uid('log'), type: 'exercise_minutes', value: [20, 25, 0, 30, 35, 20, 0][d % 7], date },
      { id: uid('log'), type: 'sleep_hours', value: [6.5, 6, 7, 5.8, 6.8, 7.2, 6.2][d % 7], date },
      { id: uid('log'), type: 'hydration_liters', value: [2.2, 1.8, 2.5, 2.0, 1.6, 2.4, 2.1][d % 7], date },
      { id: uid('log'), type: 'mood_score', value: [4, 3, 4, 3, 4, 5, 3][d % 7], date }
    );
  }
  db.logs[id] = logs;

  db.doctors[id] = [
    { id: uid('doc'), name: 'Dr. Kavita Rao', role: 'Family Doctor', specialty: 'General Physician', phone: '+91 98200 11223', clinic: 'Sunrise Family Clinic, Andheri', notes: 'Annual review each January', addedAt: '2025-01-10T10:00:00Z' },
    { id: uid('doc'), name: 'Dr. Sameer Menon', role: 'Specialist', specialty: 'Cardiologist', phone: '+91 98200 44556', clinic: 'Lifeline Heart Institute', notes: 'Consulted 2025 for BP review', addedAt: '2025-06-14T10:00:00Z' }
  ];

  db.contacts[id] = [
    { id: uid('ct'), name: 'Suresh Mehta', relation: 'Father', phone: '+91 98200 77889', notes: 'Primary emergency contact', priority: 1 },
    { id: uid('ct'), name: 'Nirmala Mehta', relation: 'Mother', phone: '+91 98200 99001', notes: '', priority: 1 },
    { id: uid('ct'), name: 'Anjali Mehta', relation: 'Spouse', phone: '+91 98200 55447', notes: '', priority: 2 },
    { id: uid('ct'), name: 'Rohit Kumar', relation: 'Friend', phone: '+91 98200 33221', notes: 'Lives nearby', priority: 3 }
  ];

  // ---- run intelligence once so dashboard/insights/reminders are warm ----
  const insights = getInsights(id);
  db.reports[id] = db.reports[id].map(r => ({
    ...r,
    summaryText: summarizeForSeed(r)
  }));

  const reminders = [];
  syncAutoReminders(user, reminders, insights.signals);
  reminders.push(
    createReminder(user, { title: 'Discuss HbA1c trend & family history with Dr. Kavita Rao', type: 'followup', source: 'auto:hba1c_followup', dueDate: addDays(todayISO(), 10) }),
    createReminder(user, { title: 'Record blood pressure', type: 'measurement', source: 'auto:bp_check', dueDate: addDays(todayISO(), 2), repeatable: true })
  );
  db.reminders[id] = reminders;

  db.plans[id] = {
    activity: generateActivityPlan(objColl('profiles', id), insights.signals),
    nutrition: generateNutritionPlan(objColl('profiles', id), insights.signals)
  };

  db.settings[id] = {
    consents: { contactsImport: false, location: false, shareReports: false, familyView: true },
    notifications: { health: true, lifestyle: true, healthcare: true, emergency: true },
    privacy: { analyticsOptOut: true }
  };
  db.audit[id] = [{ ts: new Date().toISOString(), action: 'seed', detail: 'Demo data created' }];

  persist();
  console.log(`Seeded demo account → demo@HealthSphere.ai / demo1234 (${insights.signals.length} risk signals, ${db.metrics[id].length} metrics)`);
}

function summarizeForSeed(report) {
  const t = report.structured.tests || [];
  if (!t.length) return 'No standard analytes recognized in this document.';
  const abn = t.filter(x => x.flag !== 'normal');
  const lines = [`Processed ${t.length} value(s); ${abn.length} outside their typical band.`];
  for (const x of abn.slice(0, 5)) lines.push(`• ${x.name}: ${x.value} ${x.unit} (${x.flag})`);
  lines.push('Informational summary — please discuss results with a qualified professional.');
  return lines.join('\n');
}
