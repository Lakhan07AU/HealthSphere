import { bmi, bmiCategory } from './util.js';

/* ============================================================
   MODEL 3 (part) — SPECIALTY RECOMMENDATION + SCREENING GUIDANCE
   Every suggestion explains WHY. Never claims a specialist is
   "required"; frames everything as discussion topics.
   ============================================================ */

const AREA_SPECIALTY = {
  metabolic: { specialty: 'Endocrinology (discussion)', base: 'Your records include blood-sugar-related patterns and family-history context.' },
  cardio: { specialty: 'Cardiology (discussion)', base: 'Several cardiovascular-related factors appear across your profile.' },
  thyroid: { specialty: 'Endocrinology (discussion)', base: 'Thyroid-related markers or family history are present in your records.' },
  kidney: { specialty: 'Nephrology / General Medicine (discussion)', base: 'Kidney-filtering markers in your reports warrant a professional conversation.' },
  nutrition: { specialty: 'General Physician (discussion)', base: 'Nutritional markers outside the usual band were detected.' },
  'nutrition-lite': { specialty: 'General Physician (discussion)', base: 'A nutritional marker was below its usual band.' },
  liver: { specialty: 'Gastroenterology (discussion)', base: 'Liver-enzyme values above the usual band appeared in your report.' },
  sleep: { specialty: 'General Physician / Sleep specialist (discussion)', base: 'Your logged sleep pattern suggests persistent short sleep.' }
};

export function recommendSpecialists(signals) {
  return signals
    .filter(s => s.severity !== 'info')
    .map(s => {
      const sp = AREA_SPECIALTY[s.id] || { specialty: 'Primary-care physician', base: 'Related factors were found in your health profile.' };
      return {
        signalId: s.id,
        area: s.area,
        specialty: sp.specialty,
        why: `${sp.base} Factors considered: ${s.factors.length} (${s.factors.slice(0, 3).join('; ')}${s.factors.length > 3 ? '; …' : ''}).`,
        confidence: s.severity === 'attention' ? 'higher relevance' : 'general relevance',
        note: 'A primary-care physician can help determine whether specialist evaluation is appropriate — this is not a referral.'
      };
    });
}

export function screeningChecklist(profile = {}, family = [], series = {}, latest = {}) {
  const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob)) / (365.25 * 24 * 3600 * 1000)) : null;
  const sex = String(profile.sex || '').toLowerCase();
  const items = [];
  const push = (topic, reason) => items.push({
    topic,
    reason,
    recommendedReview: 'According to applicable clinical guidance and your doctor’s advice'
  });

  push('Blood-pressure check',
    ['Routine adult preventive care', ...(series.bp_systolic?.stale ? ['no reading in over 6 months'] : [])].join(' · '));

  const lipidReason = [];
  if (latest.ldl && latest.ldl.flag !== 'normal') lipidReason.push('previous LDL above optimal');
  if (familyHas(family, /(heart|cardiac|coronary|stroke)/i).length) lipidReason.push('family cardiovascular history');
  if (age && age >= 30) lipidReason.push(`age ${age}`);
  push('Lipid profile review', lipidReason.join(' · ') || 'routine adult preventive care');

  const dmReason = [];
  if (latest.hba1c && latest.hba1c.value >= 5.7) dmReason.push('HbA1c in the prediabetes-range band on record');
  if (series.hba1c?.direction === 'increasing') dmReason.push('rising HbA1c trend');
  if (familyHas(family, FAM_DIAB).length) dmReason.push('family diabetes history');
  push('Blood-sugar screening discussion', dmReason.join(' · ') || 'periodic check commonly advised for adults');

  if (sex === 'female') {
    if (age && age >= 21) push('Cervical screening discussion', `age ${age} · per regional programme guidance`);
    if (age && age >= 40) push('Breast screening discussion', `age ${age} · discuss appropriate modality & timing with your doctor`);
  } else if (sex === 'male') {
    if (age && age >= 50) push('Prostate-health discussion', `age ${age} · benefits/limits of testing vary — best decided with a clinician`);
  }
  if (age && age >= 45) push('Colorectal screening discussion', `age ${age}`);
  if (age && age >= 50) push('Bone-health review', `age ${age}`);

  const famCancer = familyHas(family, FAM_CANCER);
  if (famCancer.length) push('Family cancer-history review', `recorded family history: ${famCancer.map(m => m.relation).join(', ')} — ask whether earlier/extra checks apply to you`);

  const b = bmi(profile.heightCm, profile.weightKg);
  if (b && b >= 25) push('Metabolic panel review', `BMI ${b} (${bmiCategory(b)})`);

  return items;
}

const FAM_DIAB = /\bdiabet/i;
const FAM_CANCER = /cancer|carcinoma|malignan/i;

function familyHas(family, re) {
  return (family || []).filter(m => (m.conditions || []).some(c => re.test(c.name || '')));
}
