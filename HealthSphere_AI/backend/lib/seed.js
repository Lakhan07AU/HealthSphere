import { db, coll, objColl, persist } from './db.js';
import { registerUser, hashPassword } from './auth.js';
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

/* ---------------- Marketplace seed: demo doctors + medical stores ----------------
   Provides working doctor and store-owner logins plus a medicine catalogue per
   store. Idempotent: accounts are matched by email, so restarts do not duplicate.
   Credentials are documented in README.md. */

function seedMarketplace() {
  let changed = false;

  const med = (name, category, description, price, mrp, stock, unit, rx = false, tags = []) => ({
    id: uid('prod'), name, category, description, price, mrp, stock, unit,
    requiresPrescription: rx, tags, image: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });

  const ensureStore = ({ ownerId, storeId, ownerName, storeName, email, password, licenseNumber, address, contact, hours, category, lat, lng, products }) => {
    if (db.storeOwnerAccounts.some(o => o.email === email)) return;
    const { salt, hash } = hashPassword(password);
    const owner = {
      id: ownerId, email, ownerName, storeName, passwordSalt: salt, passwordHash: hash,
      licenseNumber, address, contact, hours, photos: [],
      verificationStatus: 'verified', storeId, createdAt: new Date().toISOString()
    };
    const store = {
      id: storeId, ownerId, name: storeName, category, address, lat, lng, hours, contact,
      photos: [], logo: '', offers: [], products, status: 'approved',
      views: 0, clicks: 0, createdAt: new Date().toISOString()
    };
    db.storeOwnerAccounts.push(owner);
    db.stores.push(store);
    changed = true;
  };

  const ensureDoctor = ({ id, email, password, name, qualification, specialization, licenseNumber, yearsExp, fee, online }) => {
    if (db.doctorAccounts.some(d => d.email === email)) return;
    const { salt, hash } = hashPassword(password);
    db.doctorAccounts.push({
      id, email, name, passwordSalt: salt, passwordHash: hash,
      qualification, specialization, licenseNumber,
      idProof: 'Demo account — registration certificate on file',
      yearsExp, fee, verificationStatus: 'verified',
      availabilityStatus: online ? 'online' : 'offline',
      createdAt: new Date().toISOString()
    });
    changed = true;
  };

  ensureStore({
    ownerId: 'storeown_seed_sunrise', storeId: 'store_seed_sunrise',
    ownerName: 'Ravi Sharma', storeName: 'Sunrise Pharmacy',
    email: 'pharmacy1@healthsphere.ai', password: 'Pharmacy@1234',
    licenseNumber: 'MH-PH-2024-001', address: '12 Linking Road, Andheri West, Mumbai 400058',
    contact: '+91 98200 11001', hours: 'Mon-Sat 8:00-23:00, Sun 9:00-21:00',
    category: 'Pharmacy', lat: 19.1364, lng: 72.8296,
    products: [
      med('Paracetamol 500mg', 'Pain Relief', 'Fever and mild pain relief, 15 tablets per strip', 25, 32, 120, 'strip', false, ['fever', 'pain']),
      med('Metformin 500mg', 'Diabetes Care', 'First-line oral medicine for type 2 diabetes, 20 tablets', 45, 58, 80, 'strip', true, ['diabetes']),
      med('Amlodipine 5mg', 'Blood Pressure', 'Calcium-channel blocker for hypertension, 15 tablets', 38, 49, 65, 'strip', true, ['hypertension']),
      med('Cetirizine 10mg', 'Allergy', 'Antihistamine for seasonal allergies and hives, 10 tablets', 18, 24, 140, 'strip', false, ['allergy']),
      med('Vitamin D3 60K IU', 'Supplements', 'Weekly vitamin D sachet for deficiency', 85, 110, 90, 'sachet', false, ['vitamin d']),
      med('Omeprazole 20mg', 'Gastro Care', 'Acid-reflux and ulcer treatment, 15 capsules', 52, 68, 70, 'strip', true, ['acidity']),
      med('Digital Thermometer', 'Devices', 'Fast-read digital body thermometer', 199, 299, 35, 'pcs', false, ['device']),
      med('Surgical Mask (50 pack)', 'Safety', '3-ply disposable face masks', 150, 220, 60, 'box', false, ['mask'])
    ]
  });

  ensureStore({
    ownerId: 'storeown_seed_medplus', storeId: 'store_seed_medplus',
    ownerName: 'Priya Nair', storeName: 'MedPlus Chemist',
    email: 'pharmacy2@healthsphere.ai', password: 'Pharmacy@1234',
    licenseNumber: 'KA-PH-2023-442', address: '80 Feet Road, Koramangala 4th Block, Bengaluru 560034',
    contact: '+91 98450 22002', hours: 'Daily 8:30-22:30',
    category: 'Pharmacy', lat: 12.9345, lng: 77.6266,
    products: [
      med('Atorvastatin 10mg', 'Cholesterol', 'Statin for high cholesterol, 15 tablets', 78, 95, 55, 'strip', true, ['cholesterol']),
      med('Levothyroxine 50mcg', 'Thyroid Care', 'Daily thyroid hormone replacement, 30 tablets', 62, 75, 48, 'strip', true, ['thyroid']),
      med('Azithromycin 500mg', 'Antibiotics', 'Three-day antibiotic course, 3 tablets', 88, 105, 40, 'strip', true, ['antibiotic']),
      med('ORS Powder', 'Hydration', 'Oral rehydration salts for dehydration', 22, 28, 180, 'sachet', false, ['hydration']),
      med('Ibuprofen 400mg', 'Pain Relief', 'Anti-inflammatory pain relief, 10 tablets', 28, 36, 110, 'strip', false, ['pain']),
      med('Glucose Meter', 'Devices', 'Blood glucose monitoring kit with 10 strips', 749, 999, 20, 'pcs', false, ['diabetes', 'device']),
      med('BP Monitor (Automatic)', 'Devices', 'Upper-arm digital blood pressure monitor', 1499, 1999, 14, 'pcs', false, ['device']),
      med('Hand Sanitizer 500ml', 'Safety', '70% alcohol sanitizer with pump', 180, 250, 75, 'bottle', false, ['hygiene'])
    ]
  });

  ensureStore({
    ownerId: 'storeown_seed_wellcare', storeId: 'store_seed_wellcare',
    ownerName: 'Amit Verma', storeName: 'WellCare Medical Store',
    email: 'pharmacy3@healthsphere.ai', password: 'Pharmacy@1234',
    licenseNumber: 'DL-PH-2022-778', address: 'B-Block, Connaught Place, New Delhi 110001',
    contact: '+91 98110 33003', hours: 'Mon-Sun 9:00-22:00',
    category: 'Pharmacy', lat: 28.6315, lng: 77.2167,
    products: [
      med('Insulin Glargine 100IU/ml', 'Diabetes Care', 'Long-acting insulin pen, cold-chain stored', 620, 740, 18, 'pen', true, ['insulin', 'diabetes']),
      med('Aspirin 75mg', 'Heart Care', 'Low-dose blood thinner, 14 tablets', 15, 20, 130, 'strip', true, ['cardiac']),
      med('Losartan 50mg', 'Blood Pressure', 'ARB for hypertension, 15 tablets', 58, 72, 60, 'strip', true, ['hypertension']),
      med('Multivitamin Complex', 'Supplements', 'Daily multivitamin and mineral tablets, 30s', 240, 320, 85, 'bottle', false, ['vitamin']),
      med('First Aid Kit', 'Safety', 'Home and travel first-aid essentials', 399, 550, 25, 'kit', false, ['first aid']),
      med('Pulse Oximeter', 'Devices', 'Fingertip SpO2 and pulse monitor', 899, 1299, 30, 'pcs', false, ['device']),
      med('Antiseptic Solution 100ml', 'Safety', 'Povidone-iodine wound antiseptic', 65, 82, 95, 'bottle', false, ['wound']),
      med('N95 Mask (5 pack)', 'Safety', 'NIOSH-style particulate respirator masks', 275, 350, 42, 'pack', false, ['mask'])
    ]
  });

  ensureDoctor({
    id: 'docacc_seed_kavita', email: 'doctor1@healthsphere.ai', password: 'Doctor@1234',
    name: 'Dr. Kavita Rao', qualification: 'MBBS, MD (General Medicine)',
    specialization: 'General Physician', licenseNumber: 'MH-MC-2011-45231',
    yearsExp: 14, fee: 600, online: true
  });
  ensureDoctor({
    id: 'docacc_seed_sameer', email: 'doctor2@healthsphere.ai', password: 'Doctor@1234',
    name: 'Dr. Sameer Menon', qualification: 'MBBS, MD, DM (Cardiology)',
    specialization: 'Cardiologist', licenseNumber: 'MH-MC-2008-33120',
    yearsExp: 17, fee: 900, online: true
  });
  ensureDoctor({
    id: 'docacc_seed_ananya', email: 'doctor3@healthsphere.ai', password: 'Doctor@1234',
    name: 'Dr. Ananya Iyer', qualification: 'MBBS, MD, DM (Endocrinology)',
    specialization: 'Endocrinologist', licenseNumber: 'KA-MC-2013-56784',
    yearsExp: 12, fee: 800, online: false
  });

  if (changed) {
    persist();
    console.log('Seeded marketplace accounts → 3 doctors + 3 medical stores (see README.md for credentials)');
  }
}

export function ensureSeed() {
  // Seed accounts are system-created; record full consent so they satisfy
  // the same validateConsent() gate as real registrations.
  const seedConsent = { termsOfService: true, healthDataConsent: true, acknowledgements: true };

  // Admin account (must exist before demo seed check)
  if (!db.users.find(u => u.email === 'admin123@healthsphere.ai')) {
    registerUser({ name: 'Admin', email: 'admin123@healthsphere.ai', password: 'Admin@1234', ...seedConsent });
    persist();
    console.log('Seeded admin account → admin123@healthsphere.ai / Admin@1234');
  }

  // Doctors and medical stores seed independently of the patient demo account.
  seedMarketplace();

  // Skip demo seed if demo user already exists
  if (db.users.find(u => u.email === 'demo@healthsphere.ai')) return;
  const user = registerUser({ name: 'Arjun Mehta', email: 'demo@HealthSphere.ai', password: 'demo1234', ...seedConsent });
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
    { relation: 'Grandfather', name: 'Ramesh Mehta', ageOrYear: '~84', sex: 'male', conditions: [{ name: 'Type 2 Diabetes', diagAge: 62 }, { name: 'Hypertension', diagAge: 58 }] },
    { relation: 'Father', name: 'Suresh Mehta', ageOrYear: '61', sex: 'male', conditions: [{ name: 'Hypertension', diagAge: 48 }, { name: 'High cholesterol', diagAge: 52 }] },
    { relation: 'Mother', name: 'Nirmala Mehta', ageOrYear: '58', sex: 'female', conditions: [{ name: 'Hypothyroidism', diagAge: 45 }] },
    { relation: 'Uncle', name: 'Mahesh Mehta', ageOrYear: '57', sex: 'male', conditions: [{ name: 'Type 2 Diabetes', diagAge: 55 }] },
    { relation: 'Sister', name: 'Priya Shah', ageOrYear: '33', sex: 'female', conditions: [] }
  ].map((f, i) => ({ id: uid('fam'), ...f, deceased: false, surgeries: [], cancerHistory: false, geneticConditions: [], events: [], notes: '', recordedAt: new Date(Date.now() - (i + 3) * 86400000).toISOString() }));
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
