import { extractPdfText } from './pdftext.js';
import { num } from './util.js';

/* ============================================================
   MODEL 1 — DOCUMENT INTELLIGENCE
   Upload → File validation → Text extraction (OCR/parsing) →
   Medical entity extraction → Value normalization →
   Reference-range evaluation → Structured health data →
   Plain-language explanation.
   ============================================================ */

export const TEST_LIBRARY = {
  hba1c:            { name: 'HbA1c', unit: '%', refLow: 4.0, refHigh: 5.7, category: 'Metabolic', aliases: ['hba1c', 'hb a1c', 'glycated haemoglobin', 'glycosylated hemoglobin', 'a1c'] },
  glucose_fasting:  { name: 'Fasting blood glucose', unit: 'mg/dL', refLow: 70, refHigh: 99, category: 'Metabolic', aliases: ['fasting (?:blood )?glucose', 'glucose fasting', 'fasting plasma glucose', 'fbs', 'fbg'] },
  glucose_random:   { name: 'Random blood glucose', unit: 'mg/dL', refLow: 70, refHigh: 140, category: 'Metabolic', aliases: ['random blood glucose', 'postprandial glucose', 'pp glucose', 'rbs'] },
  total_cholesterol:{ name: 'Total cholesterol', unit: 'mg/dL', refLow: 100, refHigh: 200, category: 'Lipid', aliases: ['total cholesterol', 'cholesterol total', 'serum cholesterol'] },
  ldl:              { name: 'LDL cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 100, category: 'Lipid', aliases: ['ldl(?:[- ]cholesterol)?', 'low density lipoprotein'] },
  hdl:              { name: 'HDL cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 90, category: 'Lipid', lowIsBad: true, aliases: ['hdl(?:[- ]cholesterol)?', 'high density lipoprotein'] },
  triglycerides:    { name: 'Triglycerides', unit: 'mg/dL', refLow: 40, refHigh: 150, category: 'Lipid', aliases: ['triglycerides?', '\btgs?\b'] },
  bp_systolic:      { name: 'Systolic blood pressure', unit: 'mmHg', refLow: 90, refHigh: 120, category: 'Vitals', aliases: ['systolic'] },
  bp_diastolic:     { name: 'Diastolic blood pressure', unit: 'mmHg', refLow: 60, refHigh: 80, category: 'Vitals', aliases: ['diastolic'] },
  heart_rate:       { name: 'Heart rate', unit: 'bpm', refLow: 60, refHigh: 100, category: 'Vitals', aliases: ['heart rate', 'pulse'] },
  hemoglobin:       { name: 'Hemoglobin', unit: 'g/dL', refLow: 12, refHigh: 17, category: 'CBC', sexRefs: { male: [13, 17], female: [12, 15] }, aliases: ['haemoglobin', 'hemoglobin', '\bhgb\b', '\dhb\b'] },
  hematocrit:       { name: 'Hematocrit', unit: '%', refLow: 36, refHigh: 50, category: 'CBC', aliases: ['hematocrit', 'haematocrit', '\bhct\b', 'packed cell volume', '\bpcv\b'] },
  wbc:              { name: 'WBC count', unit: '/µL', refLow: 4000, refHigh: 11000, category: 'CBC', aliases: ['total leucocyte count', 'total leukocyte count', 'wbc(?: count)?', 'tlc'] },
  platelets:        { name: 'Platelet count', unit: '/µL', refLow: 150000, refHigh: 450000, category: 'CBC', aliases: ['platelet count', 'platelets'] },
  creatinine:       { name: 'Serum creatinine', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, category: 'Kidney', aliases: ['creatinine'] },
  urea:             { name: 'Blood urea', unit: 'mg/dL', refLow: 15, refHigh: 45, category: 'Kidney', aliases: ['blood urea', 'serum urea'] },
  egfr:             { name: 'eGFR', unit: 'mL/min/1.73m²', refLow: 90, refHigh: 999, category: 'Kidney', lowIsBad: true, aliases: ['(?:estimated )?gfr'] },
  uric_acid:        { name: 'Uric acid', unit: 'mg/dL', refLow: 3.5, refHigh: 7.2, category: 'Kidney', aliases: ['uric acid'] },
  alt:              { name: 'ALT (SGPT)', unit: 'U/L', refLow: 5, refHigh: 40, category: 'Liver', aliases: ['alt', 'sgpt'] },
  ast:              { name: 'AST (SGOT)', unit: 'U/L', refLow: 5, refHigh: 40, category: 'Liver', aliases: ['ast', 'sgot'] },
  bilirubin_total:  { name: 'Total bilirubin', unit: 'mg/dL', refLow: 0.2, refHigh: 1.2, category: 'Liver', aliases: ['total bilirubin'] },
  tsh:              { name: 'TSH', unit: 'µIU/mL', refLow: 0.4, refHigh: 4.0, category: 'Thyroid', aliases: ['tsh'] },
  vitamin_d:        { name: 'Vitamin D (25-OH)', unit: 'ng/mL', refLow: 30, refHigh: 100, category: 'Nutrition', lowIsBad: true, aliases: ['vitamin d', '25-?oh vitamin d'] },
  vitamin_b12:      { name: 'Vitamin B12', unit: 'pg/mL', refLow: 200, refHigh: 900, category: 'Nutrition', lowIsBad: true, aliases: ['vitamin b12', '\bb12\b'] },
  sodium:           { name: 'Sodium', unit: 'mmol/L', refLow: 135, refHigh: 145, category: 'Electrolytes', aliases: ['(?:serum )?sodium', '\bna\+?\b'] },
  potassium:        { name: 'Potassium', unit: 'mmol/L', refLow: 3.5, refHigh: 5.1, category: 'Electrolytes', aliases: ['(?:serum )?potassium', '\bk\+?\b'] }
};

const PLAIN_LANGUAGE = {
  hba1c: 'reflects average blood sugar over the past ~3 months',
  glucose_fasting: 'blood sugar after fasting',
  glucose_random: 'blood sugar at the time of the test',
  total_cholesterol: 'overall cholesterol level',
  ldl: '"bad" cholesterol that can build up in arteries',
  hdl: '"good" cholesterol that helps clear arteries',
  triglycerides: 'fats circulating in the blood',
  bp_systolic: 'pressure when the heart beats',
  bp_diastolic: 'pressure between heartbeats',
  hemoglobin: 'oxygen-carrying protein in red blood cells',
  wbc: 'infection-fighting blood cells',
  platelets: 'cells that help blood clot',
  creatinine: 'kidney filtration by-product',
  egfr: 'estimated kidney filtering rate',
  tsh: 'thyroid-stimulating hormone',
  vitamin_d: 'bone and immunity-related vitamin',
  vitamin_b12: 'nerve and blood-cell vitamin',
  alt: 'liver enzyme',
  ast: 'liver enzyme'
};

// Prompt-injection guard: documents must never override safety rules.
const INJECTION_RE = /(ignore\s+(all\s+|any\s+|previous|prior)|disregard\s+(all|any|previous|your)|system\s*prompt|you\s+are\s+now|override\s+(the\s+)?(safety|rules|instructions)|jailbreak|as\s+an\s+ai\s+now)/i;

function aliasRegex(t) {
  return new RegExp(t.aliases.join('|'), 'i');
}

export function normalizeText(raw) {
  let text = String(raw || '');
  const flags = [];
  if (INJECTION_RE.test(text)) {
    flags.push('possible_prompt_injection_ignored');
    text = text.split(/\r?\n/).filter(l => !INJECTION_RE.test(l)).join('\n');
  }
  return { text, flags };
}

export function parseReportDate(text) {
  const patterns = [
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/,
    /\b(\d{1,2})[\s-]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]+(\d{4})\b/i,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i
  ];
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    if (re === patterns[0]) return `${m[1]}-${m[2]}-${m[3]}`;
    if (re === patterns[1]) {
      // assume dd/mm/yyyy first (common lab format), fall back to mm/dd if invalid month
      let dd = +m[1], mm = +m[2];
      if (mm > 12 && dd <= 12) { const t = dd; dd = mm; mm = t; }
      return `${m[3]}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    if (re === patterns[2]) return `${m[3]}-${String(months[m[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    return `${m[3]}-${String(months[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
  }
  return null;
}

export function parseLabName(text) {
  const line = text.split(/\r?\n/).map(l => l.trim()).find(l =>
    /(laborator|lab report|patholog|diagnostic|hospital|clinic|health check|medical center)/i.test(l) && l.length < 80);
  return line ? line.replace(/^[\s*#-]+/, '').slice(0, 60) : null;
}

function refsFor(t, sex) {
  if (t.sexRefs && sex && t.sexRefs[String(sex).toLowerCase()]) {
    const [lo, hi] = t.sexRefs[String(sex).toLowerCase()];
    return [lo, hi];
  }
  return [t.refLow, t.refHigh];
}

/** Flag a single stored value against its reference band (same rules as extraction).
    Returns 'high' | 'low' | 'borderline' | 'normal' | null (no band known). */
export function flagFor(key, value, sex) {
  const t = TEST_LIBRARY[key];
  const v = Number(value);
  if (!t || !Number.isFinite(v)) return null;
  const [lo, hi] = refsFor(t, sex);
  if (lo == null || hi == null) return null;
  let flag = 'normal';
  if (v < lo) flag = 'low';
  else if (v > hi) flag = 'high';
  if (flag !== 'normal') {
    const edge = flag === 'high' ? hi : lo;
    if (edge && Math.abs(v - edge) / Math.abs(edge) <= 0.04) flag = 'borderline';
  }
  return flag;
}

/** Extract structured test results from free text. */
export function extractEntities(text, sex) {
  const found = [];
  for (const [key, t] of Object.entries(TEST_LIBRARY)) {
    const re = new RegExp(
      `(${t.aliases.join('|')})[^\\n:=]{0,40}?[:=\\s]+(?:from\\s+)?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(%|mg\\/dL|mmHg|g\\/dL|U\\/L|µIU\\/mL|uIU\\/mL|ng\\/mL|pg\\/mL|mmol\\/L|mEq\\/L|\\/µL|x10\\^?9\\/L|10\\^3\\/µL|million\\/µL|lakhs\\/µL)?`,
      'i'
    );
    const m = text.match(re);
    if (!m) continue;
    let value = num(m[2]);
    if (!Number.isFinite(value)) continue;
    let flag = 'normal';
    const [lo, hi] = refsFor(t, sex);

    // unit harmonization for WBC/platelets reported in 10^3/µL or millions/lakhs
    const unitStr = (m[3] || '').toLowerCase();
    if ((key === 'wbc' || key === 'platelets') && /10\^?3|x10|thousand/.test(unitStr)) value *= 1000;
    if ((key === 'wbc' || key === 'platelets') && /million|mn\b/.test(unitStr)) value *= 1000000;
    if (/lakhs?\b/.test(unitStr)) value *= 100000;

    if (value < lo) flag = t.lowIsBad ? 'low' : 'low';
    else if (value > hi) flag = 'high';
    else flag = 'normal';
    // borderline: within 4% of a limit
    if (flag !== 'normal') {
      const edge = flag === 'high' ? hi : lo;
      if (Math.abs(value - edge) / Math.abs(edge) <= 0.04) flag = 'borderline';
    }

    found.push({ key, name: t.name, value, unit: t.unit, refLow: lo, refHigh: hi, flag, category: t.category });
  }

  // Blood pressure "120/80" combined form
  if (!found.some(f => f.key === 'bp_systolic')) {
    const bp = text.match(/(?:blood pressure|\bbp\b)[^\n\d]{0,20}(\d{2,3})\s*\/\s*(\d{2,3})/i);
    if (bp) {
      found.push(mk('bp_systolic', +bp[1], sex));
      found.push(mk('bp_diastolic', +bp[2], sex));
    }
  }
  return dedupe(found);
}

function mk(key, value, sex) {
  const t = TEST_LIBRARY[key];
  const [lo, hi] = refsFor(t, sex);
  let flag = 'normal';
  if (value > hi) flag = 'high';
  else if (value < lo) flag = 'low';
  return { key, name: t.name, value, unit: t.unit, refLow: lo, refHigh: hi, flag, category: t.category };
}

function dedupe(tests) {
  const seen = new Map();
  for (const t of tests) {
    const prev = seen.get(t.key);
    if (!prev || (prev.flag === 'normal' && t.flag !== 'normal')) seen.set(t.key, t);
  }
  return [...seen.values()];
}

/** Full processing pipeline. Returns pipeline stages + structured data + explanation. */
export function processDocument({ filename, mime, size, buffer }, ctx = {}) {
  const stages = [];
  const okExt = /\.(pdf|txt|png|jpe?g)$/i.test(filename || '');
  const okSize = (size || 0) <= 15 * 1024 * 1024;
  stages.push({
    stage: 'File validation',
    status: okExt && okSize ? 'ok' : 'error',
    detail: okExt ? `${filename} · ${(size / 1024).toFixed(0)} KB` : 'Unsupported file type or size (>15 MB)'
  });
  if (!okExt || !okSize) return { stages, error: true };

  let rawText = '';
  let mode = '';
  if (/\.pdf$/i.test(filename || '') || (mime === 'application/pdf')) {
    rawText = extractPdfText(buffer);
    mode = rawText ? 'Digital PDF text layer parsed' : 'No text layer found (likely scanned image)';
  } else if (/\.(txt|text)$/i.test(filename || '')) {
    rawText = buffer.toString('utf8');
    mode = 'Plain text ingested';
  } else {
    mode = 'Image OCR simulated — please review values below';
  }
  stages.push({ stage: 'OCR / document parsing', status: rawText ? 'ok' : 'warn', detail: mode });

  const { text, flags } = normalizeText(rawText);
  stages.push({
    stage: 'Safety pre-check',
    status: 'ok',
    detail: flags.length ? 'Embedded instructions detected and ignored (prompt-injection guard)' : 'No embedded instruction content honored'
  });

  const reportDate = parseReportDate(text) || ctx.fallbackDate || null;
  const labName = parseLabName(text);
  const tests = extractEntities(text, ctx.sex);

  stages.push({
    stage: 'Medical entity extraction',
    status: tests.length ? 'ok' : 'warn',
    detail: tests.length ? `${tests.length} analytes recognized` : 'No known analytes auto-detected — manual review suggested'
  });
  stages.push({ stage: 'Value normalization & reference ranges', status: 'ok', detail: `${tests.filter(t => t.flag !== 'normal').length} value(s) outside typical reference band` });
  stages.push({ stage: 'Structured health data', status: 'ok', detail: 'Saved to your health graph' });

  const structured = {
    reportDate,
    labName,
    tests,
    observations: tests.filter(t => t.flag !== 'normal').map(t => ({ key: t.key, message: observationFor(t) })),
    flags,
    extractedAt: new Date().toISOString()
  };
  return { stages, structured };
}

function observationFor(t) {
  const dir = t.flag === 'high' ? 'above' : t.flag === 'borderline' ? 'near the upper edge of' : 'below';
  return `${t.name} is ${dir} the typical range (${t.value} ${t.unit}, usual band ${t.refLow}–${t.refHigh}).`;
}

/**
 * MODEL 5 — HEALTH EXPLANATION ASSISTANT.
 * Converts structured data into careful, non-diagnostic plain language.
 */
export function explainReport(structured, trendInfo = {}) {
  const lines = [];
  lines.push(`Report${structured.reportDate ? ` dated ${fmt(structured.reportDate)}` : ''}${structured.labName ? ` · ${structured.labName}` : ''}`);
  if (!structured.tests.length) {
    lines.push('We could not confidently recognize standard test values in this document. You can add readings manually so trends and guidance stay up to date.');
    return lines.join('\n');
  }
  const abnormal = structured.tests.filter(t => t.flag !== 'normal');
  const normalCount = structured.tests.length - abnormal.length;
  if (normalCount) lines.push(`${normalCount} value(s) are within their typical reference band.`);
  for (const t of abnormal.slice(0, 6)) {
    const what = PLAIN_LANGUAGE[t.key] || 'a measured health indicator';
    lines.push(`${t.name} (${t.value} ${t.unit}) is ${t.flag === 'borderline' ? 'close to the edge of' : t.flag === 'high' ? 'above' : 'below'} the laboratory's usual band — this ${what}.`);
  }
  if (trendInfo && trendInfo.text) lines.push(trendInfo.text);
  lines.push('Interpretation depends on your clinical context. Please discuss these results with a qualified healthcare professional — this summary is informational, not a diagnosis.');
  return lines.join('\n');
}

function fmt(iso) {
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  } catch { return iso; }
}
