import { labelOf } from './trends.js';
import { bmi } from './util.js';

/* ============================================================
   MODEL 3 — RECOMMENDATION / RISK ENGINE (rule layer)
   Evidence-informed clinical rules → risk SIGNALS (never diagnoses),
   each with explainability ("Why am I seeing this?").
   A SAFETY LAYER sanitizes all output before it reaches the user.
   ============================================================ */

const FAM_MAP = {
  diabetes: /\bdiabet/i,
  heart: /(heart|cardiac|cardio|coronary|\bmi\b|stroke|hypertension|blood pressure)/i,
  thyroid: /thyroid/i,
  kidney: /kidney|renal/i,
  cancer: /cancer|carcinoma|tumor|tumour|malignan/i,
  obesity: /obes/i
};

function familyHas(family, re) {
  return (family || []).filter(m => (m.conditions || []).some(c => re.test(c.name || '')));
}

/**
 * @param ctx { profile, family, series: {key -> analyzeSeries result}, latest: {key->entry} }
 */
export function computeSignals(ctx) {
  const { profile = {}, family = [], series = {}, latest = {} } = ctx;
  const signals = [];
  const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob)) / (365.25 * 24 * 3600 * 1000)) : null;
  const sex = String(profile.sex || '').toLowerCase();
  const userBmi = bmi(profile.heightCm, profile.weightKg);
  const dataWindow = 'All records in your health graph';

  /* ---- Metabolic / prediabetes-range pattern ---- */
  {
    const f = [];
    let sev = 0;
    const a1c = latest.hba1c;
    if (a1c) {
      if (a1c.value >= 5.7) { f.push(`Latest HbA1c is ${a1c.value}% (above the 4.0–5.7% typical band)`); sev = Math.max(sev, a1c.value >= 6.0 ? 2 : 1); }
      if (series.hba1c?.direction === 'increasing') f.push('HbA1c trend across your reports is increasing');
    }
    const g = latest.glucose_fasting;
    if (g && g.value >= 100) { f.push(`Fasting glucose ${g.value} mg/dL (typical band 70–99)`); sev = Math.max(sev, g.value >= 126 ? 2 : 1); }
    const famDiab = familyHas(family, FAM_MAP.diabetes);
    if (famDiab.length) f.push(`Family history: ${famDiab.map(m => m.relation).join(', ')} — diabetes-related condition recorded`);
    if (userBmi && userBmi >= 25) f.push(`BMI ${userBmi}`);
    const act = profile.lifestyle?.activityLevel;
    if (act === 'sedentary' || act === 'light') f.push(`Reported activity level: ${act || 'light'}`);
    if (age && age >= 35) f.push(`Age ${age}`);

    if (f.length >= 2 || sev > 0) {
      signals.push({
        id: 'metabolic',
        area: 'Metabolic & blood-sugar health',
        severity: sev >= 2 ? 'attention' : 'watch',
        factors: f,
        action: 'Consider discussing your blood-sugar pattern and trend with a qualified healthcare professional.',
        why: f.map(x => ({ label: x })),
        dataConsidered: dataWindow
      });
    }
  }

  /* ---- Cardiovascular ---- */
  {
    const f = [];
    let sev = 0;
    const sys = series.bp_systolic, dia = series.bp_diastolic;
    const elevatedReadings = countAbove(latest._bpList || [], s => s.value > 130);
    if (sys?.last && sys.last.value >= 130) { f.push(`Recent systolic BP ${sys.last.value} mmHg`); sev = Math.max(sev, sys.last.value >= 140 ? 2 : 1); }
    else if (elevatedReadings >= 1) { f.push(`${elevatedReadings} systolic reading(s) above 130 mmHg on record`); sev = Math.max(sev, 1); }
    if (dia?.last && dia.last.value >= 85) { f.push(`Recent diastolic BP ${dia.last.value} mmHg`); sev = Math.max(sev, 1); }
    if (series.bp_systolic?.direction === 'increasing' || series.bp_diastolic?.direction === 'increasing') f.push('Blood-pressure trend is increasing across your records');
    const ldl = latest.ldl;
    if (ldl && ldl.value >= 130) { f.push(`LDL cholesterol ${ldl.value} mg/dL (optimal <100)`); sev = Math.max(sev, 1); }
    const tg = latest.triglycerides;
    if (tg && tg.value >= 150) f.push(`Triglycerides ${tg.value} mg/dL`);
    const hdl = latest.hdl;
    if (hdl && hdl.flag === 'low') f.push(`HDL cholesterol ${hdl.value} mg/dL (below the usual band)`);
    const famHeart = familyHas(family, FAM_MAP.heart);
    if (famHeart.length) f.push(`Family history: ${famHeart.map(m => m.relation).join(', ')} — cardiovascular-related condition(s) recorded`);
    if (profile.lifestyle?.smoking === 'current') { f.push('Current smoker'); sev = Math.max(sev, 2); }
    if (userBmi && userBmi >= 27) f.push(`BMI ${userBmi}`);
    const hrLogs = (latest._exerciseAvg ?? null);
    if (hrLogs !== null && hrLogs < 60) f.push(`Low weekly activity (~${Math.round(hrLogs)} min/week logged)`);

    if (f.length >= 2 || sev > 0) {
      signals.push({
        id: 'cardio',
        area: 'Cardiovascular health',
        severity: sev >= 2 ? 'attention' : 'watch',
        factors: f,
        action: 'Your profile contains several cardiovascular-related factors. Consider discussing your overall cardiovascular risk with a healthcare professional — a primary-care physician can help decide whether specialist evaluation is appropriate.',
        why: f.map(x => ({ label: x })),
        dataConsidered: dataWindow
      });
    }
  }

  /* ---- Thyroid ---- */
  {
    const tsh = latest.tsh;
    const famThy = familyHas(family, FAM_MAP.thyroid);
    const f = [];
    let sev = 0;
    if (tsh && tsh.flag !== 'normal') { f.push(`TSH ${tsh.value} µIU/mL (${tsh.flag} vs usual 0.4–4.0 band)`); sev = 1; }
    if (tsh && tsh.flag === 'normal' && famThy.length) f.push('Family history of thyroid conditions with a normal recent TSH');
    if (famThy.length && !tsh) f.push(`Family history: ${famThy.map(m => m.relation).join(', ')} — thyroid condition recorded; no TSH on file`);
    if (f.length && (tsh?.flag !== 'normal' ? true : f.some(x => x.includes('no TSH')))) {
      signals.push({
        id: 'thyroid', area: 'Thyroid health',
        severity: sev ? 'watch' : 'info',
        factors: f,
        action: 'If relevant to you, thyroid function is a common topic to review with a doctor during routine check-ups.',
        why: f.map(x => ({ label: x })), dataConsidered: dataWindow
      });
    }
  }

  /* ---- Kidney ---- */
  {
    const f = []; let sev = 0;
    const cr = latest.creatinine, egfr = latest.egfr;
    if (cr && cr.flag !== 'normal') { f.push(`Creatinine ${cr.value} mg/dL outside usual band`); sev = 1; }
    if (egfr && egfr.value < 90) { f.push(`Estimated GFR ${egfr.value} mL/min/1.73m²`); sev = egfr.value < 60 ? 2 : 1; }
    const bpHigh = latest.bp_systolic && latest.bp_systolic.value >= 130;
    if (bpHigh) f.push('Blood-pressure readings above 130 mmHg can affect kidney health over time');
    if (f.length >= 2 || sev > 0) {
      signals.push({ id: 'kidney', area: 'Kidney health', severity: sev >= 2 ? 'attention' : 'watch', factors: f,
        action: 'Kidney markers are worth reviewing alongside blood pressure with your healthcare professional.', why: f.map(x => ({ label: x })), dataConsidered: dataWindow });
    }
  }

  /* ---- Nutrition / anemia ---- */
  {
    const f = [];
    const hb = latest.hemoglobin, vd = latest.vitamin_d, b12 = latest.vitamin_b12;
    if (hb && hb.flag === 'low') f.push(`Hemoglobin ${hb.value} g/dL below the usual band for your profile`);
    if (vd && vd.flag === 'low') f.push(`Vitamin D ${vd.value} ng/mL below the usual band`);
    if (b12 && b12.flag === 'low') f.push(`Vitamin B12 ${b12.value} pg/mL below the usual band`);
    if (f.length >= 2) {
      signals.push({ id: 'nutrition', area: 'Nutritional markers', severity: 'watch', factors: f,
        action: 'Nutritional deficiencies are common and generally easy to discuss at a routine visit.', why: f.map(x => ({ label: x })), dataConsidered: dataWindow });
    } else if (f.length === 1) {
      signals.push({ id: 'nutrition-lite', area: 'Nutritional markers', severity: 'info', factors: f,
        action: 'You may want to include this marker in your next routine blood test discussion.', why: f.map(x => ({ label: x })), dataConsidered: dataWindow });
    }
  }

  /* ---- Liver ---- */
  {
    const alt = latest.alt, ast = latest.ast;
    const f = [];
    if (alt && alt.flag !== 'normal') f.push(`ALT (SGPT) ${alt.value} U/L above the usual band`);
    if (ast && ast.flag !== 'normal') f.push(`AST (SGOT) ${ast.value} U/L above the usual band`);
    if (f.length) signals.push({ id: 'liver', area: 'Liver enzymes', severity: 'watch', factors: f,
      action: 'Liver enzymes can fluctuate; repeating the test and discussing with a doctor is a common approach.', why: f.map(x => ({ label: x })), dataConsidered: dataWindow });
  }

  /* ---- Sleep & lifestyle info ---- */
  {
    const f = [];
    if (series.sleep_hours?.mean && series.sleep_hours.mean < 6.5) f.push(`Average sleep ~${series.sleep_hours.mean.toFixed(1)} h/night across recent logs`);
    if (series.sleep_hours?.direction === 'decreasing' && series.sleep_hours.totalChange <= -0.8) f.push('Sleep duration trending down in your logs');
    if (f.length) signals.push({ id: 'sleep', area: 'Sleep & recovery', severity: 'info', factors: f,
      action: 'Consistent sleep timing is one of the most impactful lifestyle habits — consider discussing persistent issues with a professional.', why: f.map(x => ({ label: x })), dataConsidered: 'Last 30 days of lifestyle logs' });
  }

  /* ---- Missing-data nudges (PRD 8.7) ---- */
  for (const key of ['hba1c', 'bp_systolic', 'weight']) {
    const a = series[key];
    if (a && a.stale) {
      signals.push({
        id: `stale_${key}`, area: 'Data completeness', severity: 'info',
        factors: [`${labelOf(key)} has no readings for ${a.daysSinceLast} days`],
        action: 'Adding a fresh reading keeps your trends and guidance accurate.',
        why: [{ label: `${labelOf(key)} last recorded ${a.daysSinceLast} days ago` }],
        dataConsidered: dataWindow
      });
    }
  }

  const order = { attention: 0, watch: 1, info: 2 };
  return signals.sort((a, b) => order[a.severity] - order[b.severity]);
}

function countAbove(list, fn) { return (list || []).filter(fn).length; }

/* ---------------- SAFETY LAYER ---------------- */
const BANNED = /\b(diagnos(e|es|is|ed)|you have \w+ disease|prescri(b|ption)|dosage|guarantee\w*|cure)\b/gi;

export function safetySanitize(signals) {
  const cleaned = signals
    .filter(s => Array.isArray(s.factors) && s.factors.length > 0)
    .map(s => ({
      ...s,
      title: stripBanned(s.area),
      factors: s.factors.map(stripBanned),
      action: stripBanned(s.action) + disclaimerSuffix(s.severity)
    }));
  return {
    signals: cleaned,
    disclaimers: [
      'HealthSphere AI provides information and organization support — it does not diagnose conditions or replace medical professionals.',
      'Risk "signals" are pattern observations from your own records and general guidance, not predictions or diagnoses.'
    ]
  };
}

function stripBanned(s) { return String(s).replace(BANNED, 'assess'); }
function disclaimerSuffix(sev) {
  if (sev === 'attention') return ' Please seek professional evaluation rather than self-interpreting.';
  return '';
}
