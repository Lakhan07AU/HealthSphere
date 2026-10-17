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
  hba1c:            { name: 'HbA1c', unit: '%', refLow: 4.0, refHigh: 5.7, category: 'Metabolic', aliases: ['\\bhba[1li]c\\b', '\\bhb\\s*a\\s*1c\\b', 'glycated\\s+haemoglobin', 'glycosylated\\s+hemoglobin', '\\ba1c\\b'] },
  glucose_fasting:  { name: 'Fasting blood glucose', unit: 'mg/dL', refLow: 70, refHigh: 99, category: 'Metabolic', aliases: ['fasting (?:blood )?glucose', 'glucose fasting', 'fasting plasma glucose', '\\bfbs\\b', '\\bfbg\\b'] },
  glucose_random:   { name: 'Random blood glucose', unit: 'mg/dL', refLow: 70, refHigh: 140, category: 'Metabolic', aliases: ['random blood glucose', 'postprandial glucose', 'pp glucose', '\\brbs\\b'] },
  total_cholesterol:{ name: 'Total cholesterol', unit: 'mg/dL', refLow: 100, refHigh: 200, category: 'Lipid', aliases: ['total cholesterol', 'cholesterol total', 'serum cholesterol'] },
  ldl:              { name: 'LDL cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 100, category: 'Lipid', aliases: ['\\bldl\\b(?:[- ]cholesterol)?', 'low density lipoprotein'] },
  hdl:              { name: 'HDL cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 90, category: 'Lipid', lowIsBad: true, aliases: ['\\bhdl\\b(?:[- ]cholesterol)?', 'high density lipoprotein'] },
  triglycerides:    { name: 'Triglycerides', unit: 'mg/dL', refLow: 40, refHigh: 150, category: 'Lipid', aliases: ['triglycerides?', '\\btgs?\\b'] },
  bp_systolic:      { name: 'Systolic blood pressure', unit: 'mmHg', refLow: 90, refHigh: 120, category: 'Vitals', aliases: ['systolic'] },
  bp_diastolic:     { name: 'Diastolic blood pressure', unit: 'mmHg', refLow: 60, refHigh: 80, category: 'Vitals', aliases: ['diastolic'] },
  heart_rate:       { name: 'Heart rate', unit: 'bpm', refLow: 60, refHigh: 100, category: 'Vitals', aliases: ['heart rate', 'pulse'] },
  hemoglobin:       { name: 'Hemoglobin', unit: 'g/dL', refLow: 12, refHigh: 17, category: 'CBC', sexRefs: { male: [13, 17], female: [12, 15] }, aliases: ['haemoglobin', 'hemoglobin', '\\bhgb\\b', '\\dhb\\b'] },
  hematocrit:       { name: 'Hematocrit', unit: '%', refLow: 36, refHigh: 50, category: 'CBC', aliases: ['hematocrit', 'haematocrit', '\\bhct\\b', 'packed cell volume', '\\bpcv\\b'] },
  wbc:              { name: 'WBC count', unit: '/µL', refLow: 4000, refHigh: 11000, category: 'CBC', aliases: ['total leucocyte count', 'total leukocyte count', '\\bwbc\\b(?: count)?', '\\btlc\\b'] },
  platelets:        { name: 'Platelet count', unit: '/µL', refLow: 150000, refHigh: 450000, category: 'CBC', aliases: ['platelet count', 'platelets'] },
  creatinine:       { name: 'Serum creatinine', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, category: 'Kidney', aliases: ['creatinine'] },
  urea:             { name: 'Blood urea', unit: 'mg/dL', refLow: 15, refHigh: 45, category: 'Kidney', aliases: ['blood urea', 'serum urea'] },
  egfr:             { name: 'eGFR', unit: 'mL/min/1.73m²', refLow: 90, refHigh: 999, category: 'Kidney', lowIsBad: true, aliases: ['\\b(?:estimated )?gfr\\b'] },
  uric_acid:        { name: 'Uric acid', unit: 'mg/dL', refLow: 3.5, refHigh: 7.2, category: 'Kidney', aliases: ['uric acid'] },
  alt:              { name: 'ALT (SGPT)', unit: 'U/L', refLow: 5, refHigh: 40, category: 'Liver', aliases: ['\\balt\\b', '\\bsgpt\\b', 'alanine aminotransferase', 'alanine transaminase'] },
  ast:              { name: 'AST (SGOT)', unit: 'U/L', refLow: 5, refHigh: 40, category: 'Liver', aliases: ['\\bast\\b', '\\bsgot\\b', 'aspartate aminotransferase', 'aspartate transaminase'] },
  alp:              { name: 'ALP (Alkaline phosphatase)', unit: 'U/L', refLow: 30, refHigh: 120, category: 'Liver', aliases: ['alkaline phosphatase', 'serum alkaline phosphatase', '\\balp\\b'] },
  albumin:          { name: 'Albumin', unit: 'g/dL', refLow: 3.5, refHigh: 5.5, category: 'Liver', aliases: ['serum albumin', 'albumin'] },
  total_protein:    { name: 'Total protein', unit: 'g/dL', refLow: 6.0, refHigh: 8.3, category: 'Liver', aliases: ['total proteins?'] },
  globulin:         { name: 'Globulin', unit: 'g/dL', refLow: 2.0, refHigh: 3.5, category: 'Liver', aliases: ['globulins?', 'serum globulin'] },
  bilirubin_total:  { name: 'Total bilirubin', unit: 'mg/dL', refLow: 0.2, refHigh: 1.2, category: 'Liver', aliases: ['total bilirubin', 'bilirubin[ ,]+total'] },
  bilirubin_direct: { name: 'Direct bilirubin', unit: 'mg/dL', refLow: 0.0, refHigh: 0.3, category: 'Liver', aliases: ['direct bilirubin', 'bilirubin[ ,]+direct', 'conjugated bilirubin'] },
  bilirubin_indirect:{ name: 'Indirect bilirubin', unit: 'mg/dL', refLow: 0.2, refHigh: 0.8, category: 'Liver', aliases: ['indirect bilirubin', 'bilirubin[ ,]+indirect', 'unconjugated bilirubin'] },
  tsh:              { name: 'TSH', unit: 'µIU/mL', refLow: 0.4, refHigh: 4.0, category: 'Thyroid', aliases: ['\\btsh\\b'] },
  vitamin_d:        { name: 'Vitamin D (25-OH)', unit: 'ng/mL', refLow: 30, refHigh: 100, category: 'Nutrition', lowIsBad: true, aliases: ['vitamin d', '25-?oh vitamin d'] },
  vitamin_b12:      { name: 'Vitamin B12', unit: 'pg/mL', refLow: 200, refHigh: 900, category: 'Nutrition', lowIsBad: true, aliases: ['vitamin b12', '\\bb12\\b'] },
  sodium:           { name: 'Sodium', unit: 'mmol/L', refLow: 135, refHigh: 145, category: 'Electrolytes', aliases: ['(?:serum )?sodium', '\\bna\\+\\b', '\\(na\\+?\\)'] },
  potassium:        { name: 'Potassium', unit: 'mmol/L', refLow: 3.5, refHigh: 5.1, category: 'Electrolytes', aliases: ['(?:serum )?potassium', '\\bk\\+\\b', '\\(k\\+?\\)'] }
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
  ast: 'liver enzyme',
  alp: 'liver and bone enzyme',
  albumin: 'main protein made by the liver',
  total_protein: 'overall protein level in blood',
  globulin: 'immune-related blood proteins',
  bilirubin_total: 'bile pigment cleared by the liver',
  bilirubin_direct: 'bile pigment already processed by the liver',
  bilirubin_indirect: 'bile pigment not yet processed by the liver'
};

// Prompt-injection guard: documents must never override safety rules.
const INJECTION_RE = /(ignore\s+(all\s+|any\s+|previous|prior)|disregard\s+(all|any|previous|your)|system\s*prompt|you\s+are\s+now|override\s+(the\s+)?(safety|rules|instructions)|jailbreak|as\s+an\s+ai\s+now)/i;

function aliasRegex(t) {
  return new RegExp(t.aliases.join('|'), 'i');
}

/** OCR often wraps a label across lines. Turn literal spaces in an alias into
    \s+ so wrapped labels still match — skipping spaces inside [...] classes.
    Literal commas become optional (reports write "Bilirubin, Total"). */
function aliasPattern(alias) {
  let out = '', inClass = false;
  for (const ch of alias) {
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    if (!inClass && ch === ' ') out += '\\s+';
    else if (!inClass && ch === ',') out += ',?';
    else out += ch;
  }
  return out;
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
  // Reject impossible calendar dates (binary noise in scanned PDFs can
  // otherwise fabricate dates like "4105-40-30").
  const sane = (y, mo, d) => {
    y = +y; mo = +mo; d = +d;
    if (!(y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let out = null;
    if (re === patterns[0]) out = sane(m[1], m[2], m[3]);
    else if (re === patterns[1]) {
      // assume dd/mm/yyyy first (common lab format), fall back to mm/dd if invalid month
      let dd = +m[1], mm = +m[2];
      if (mm > 12 && dd <= 12) { const t = dd; dd = mm; mm = t; }
      out = sane(m[3], mm, dd);
    }
    else if (re === patterns[2]) out = sane(m[3], months[m[2].slice(0, 3).toLowerCase()], +m[1]);
    else out = sane(m[3], months[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if (out) return out;
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

/** OCR-safe number parse: strips thousands separators and fixes the classic
    scanner confusions (letter O for zero, letter l/I for one). */
function ocrNum(raw) {
  const cleaned = String(raw).replace(/[,\s]/g, '').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
  return num(cleaned);
}

/* ---------- Layout-tolerant row parsing ----------
   Lab tables come in many shapes: `Name value unit` on one line (digital
   PDFs), or the name on one line and the value on a "Method - ..." line
   below it (photographed tables), or name/value/unit/range each on their
   own line. We anchor on a recognized test name, then look for its value
   on the same line first and in the next two continuation lines after it. */

// Units recognized immediately after a value (case-insensitive).
const UNIT_ALTS = [
  'mg/dL', '%', 'mmHg', 'g/dL', 'gm/dL', 'U/L', 'IU/L', 'µIU/mL', 'uIU/mL',
  'ng/mL', 'pg/mL', 'mmol/L', 'mEq/L', '/µL', 'x10^9/L', '10^3/µL',
  'million/µL', 'lakhs/µL', 'lac'
];
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNIT_SRC = UNIT_ALTS.map(escRe).join('|');
// Printed unit → canonical stored unit (explicit 1:1 conversions only).
const UNIT_CANON = {
  'mg/dl': 'mg/dL', '%': '%', 'mmhg': 'mmHg', 'g/dl': 'g/dL', 'gm/dl': 'g/dL',
  'u/l': 'U/L', 'iu/l': 'U/L', 'µiu/ml': 'µIU/mL', 'uiu/ml': 'uIU/mL',
  'ng/ml': 'ng/mL', 'pg/ml': 'pg/mL', 'mmol/l': 'mmol/L', 'meq/l': 'mEq/L',
  '/µl': '/µL', 'x10^9/l': 'x10^9/L', '10^3/µl': '10^3/µL',
  'million/µl': 'million/µL', 'lakhs/µl': 'lakhs/µL', 'lac': 'Lac'
};

// Test-name fragments that are NOT in the library but look like one: when
// such a token precedes an alias match on the same line, the alias is part
// of a *different* test's name (e.g. haemoglobin inside "MCH (Mean Corpus
// Haemoglobin)") and must not anchor here.
const SKIP_TOKENS = ['mchc', 'mch', 'mcv', 'rdw-cv', 'rdw-sd', 'rdw', 'esr', 'rbc'];
const SKIP_RE = new RegExp(`\\b(${SKIP_TOKENS.join('|')})\\b`, 'i');

// Lines that can never carry a measurement: footers, page markers, headers.
// A value line always contains its number, so header-looking continuation
// lines (no digits at all) are safe to stop at.
const FOOTER_RE = /^(page|status\s*:|report status|checked by|pathologist|consultant)/i;
// Guidance prose ("If potassium is >6.5, repeat the sample…") names tests
// without reporting a result — never an anchor line.
const GUIDANCE_RE = /^\s*(if\b.*(please|repeat|interpretation)|interpretation\s*:)/i;

const aliasCache = new Map();
function aliasLineRegex(key) {
  let re = aliasCache.get(key);
  if (!re) {
    re = new RegExp(TEST_LIBRARY[key].aliases.map(aliasPattern).join('|'), 'i');
    aliasCache.set(key, re);
  }
  return re;
}

/** Test-name anchors on one line: [{ key, index, text }]. */
function anchorsIn(line) {
  const out = [];
  for (const [key] of Object.entries(TEST_LIBRARY)) {
    const m = line.match(aliasLineRegex(key));
    if (!m) continue;
    // Competing-test guard: a foreign test token before our match means the
    // match belongs to that other test's name.
    const sk = line.match(SKIP_RE);
    if (sk && sk.index < m.index) continue;
    out.push({ key, index: m.index, text: m[0] });
  }
  return out;
}

// Legacy same-line shape, applied per line (identical semantics to the old
// whole-text regex for single-line rows): alias, ≤40 chars, separator, value.
function sameLineValue(line, key) {
  const t = TEST_LIBRARY[key];
  const re = new RegExp(
    `(${t.aliases.map(aliasPattern).join('|')})[^\\n:=]{0,40}?[:=\\s\\-–—]+(?:result\\s*[:=]?\\s*)?(?:from\\s+)?([0-9][0-9,OolI]*(?:\\.[0-9OolI]+)?)\\s*(${UNIT_SRC})?`,
    'i'
  );
  const m = line.match(re);
  if (!m) return null;
  // lastIndexOf: the value digits may also appear inside the alias text
  // itself (e.g. "B12"), so anchor the position check at the trailing number.
  if (isRangePosition(line, m.index + m[0].lastIndexOf(m[2]), m.index + m[0].length)) return null;
  return { raw: m[2], unitPrinted: m[3] || null, after: line.slice(m.index + m[0].length) };
}

/** True when the number at [s,e) is a reference-range bound, not a result:
    directly followed by "- <number>" (range-low) or preceded by "<number> -"
    (range-high). */
function isRangePosition(zone, s, e) {
  if (/^\s*[-–—]\s*\d/.test(zone.slice(e))) return true;
  if (/\d\s*[-–—]\s*$/.test(zone.slice(0, s))) return true;
  return false;
}

/** Extract structured test results from free text.
    Returns { tests, unresolved }: tests carry confidence/refSource/unitPrinted
    provenance; unresolved lists recognized test names whose value was not
    legible, so the UI can ask for review instead of guessing. */
export function extractEntities(text, sex) {
  const found = [];
  const unresolved = [];
  const lines = String(text || '').split(/\r?\n/);

  // Blood pressure "120/80" combined form (unchanged legacy behavior).
  const bp = text.match(/(?:blood pressure|\bbp\b)[^\n\d]{0,20}(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bp) {
    found.push(mk('bp_systolic', +bp[1], sex));
    found.push(mk('bp_diastolic', +bp[2], sex));
  }

  for (let i = 0; i < lines.length; i++) {
    if (GUIDANCE_RE.test(lines[i])) continue;
    const anchors = anchorsIn(lines[i]);
    if (!anchors.length) continue;
    for (const { key, text: namePrinted } of anchors) {
      if (found.some(f => f.key === key && f.confidence === 'high')) continue;
      const t = TEST_LIBRARY[key];

      // 1) same line, legacy shape
      let hit = sameLineValue(lines[i], key);
      let zone = lines[i];
      if (!hit) {
        // 2) continuation window: up to 2 following lines that cannot start a
        //    new row (no other anchor, no colon-led header, no footer, short).
        const parts = [lines[i]];
        const unitLineRe = new RegExp(`^\\s*(${UNIT_SRC})\\s*$`, 'i');
        for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
          const ln = lines[j];
          if (!ln.trim() || anchorsIn(ln).some(a => a.key !== key)) break;
          if (ln.length > 160 || FOOTER_RE.test(ln.trim()) || GUIDANCE_RE.test(ln) || /:/.test(ln)) break;
          // A digit-less line continues the row only when it is exactly a
          // unit ("gm/dL" on its own line in digital PDFs); bare headers
          // ("A/G Ratio") end the row instead.
          if (!/\d/.test(ln) && !unitLineRe.test(ln)) break;
          parts.push(ln);
        }
        if (parts.length > 1) {
          zone = parts.join(' ');
          hit = zoneValue(zone);
        }
      }
      if (!hit) { unresolved.push({ key, name: t.name, reason: 'value-not-legible' }); continue; }
      const test = buildTest(key, hit, namePrinted, sex);
      if (test) found.push(test);
      else unresolved.push({ key, name: t.name, reason: 'value-not-legible' });
    }
  }
  const tests = dedupe(found);
  // An anchor inside guidance text ("if potassium is >6.5, repeat…") must not
  // report a test as unreadable when its real value was extracted elsewhere.
  const have = new Set(tests.map(t => t.key));
  return { tests, unresolved: dedupeUnresolved(unresolved.filter(u => !have.has(u.key))) };
}

/** First number+unit (or bare end-of-zone number) in a joined row zone,
    skipping reference-range bounds. */
function zoneValue(zone) {
  // (?![\w/]) instead of \b: units ending in non-word chars (%, /µL) must
  // still match at end-of-zone, while "U/L0" must not partially match.
  const reUnit = new RegExp(`([0-9][0-9,OolI]*(?:\\.[0-9OolI]+)?)\\s*(${UNIT_SRC})(?![\\w/])`, 'gi');
  let m;
  while ((m = reUnit.exec(zone))) {
    const s = m.index, e = s + m[0].length;
    if (isRangePosition(zone, s, e)) continue;
    return { raw: m[1], unitPrinted: m[2], after: zone.slice(e) };
  }
  // Bare-number fallback: only a number sitting at the very end of the zone
  // (not a ratio part, not a range part) — unit unknown, confidence capped.
  const reBare = /([0-9][0-9,OolI]*(?:\.[0-9OolI]+)?)\s*[;).]*\s*$/;
  const b = zone.match(reBare);
  if (b) {
    const s = zone.length - b[0].length, e = zone.length;
    if (isRangePosition(zone, s, e)) return null;
    if (/:\s*$/.test(zone.slice(0, s))) return null;
    return { raw: b[1], unitPrinted: null, after: '' };
  }
  return null;
}

/** Parse the laboratory's printed reference interval from the text that
    follows the value: `a - b`, `UP TO x`, `< x`, `> x`.
    Returns { band } | { damaged } | null. A bound glued to a letter
    ("< 24O" — OCR ate the zero) is malformed, never a real interval. */
function parsePrintedRange(after) {
  const seg = String(after || '').slice(0, 60);
  const NUM = String.raw`\d+(?:\.\d+)?`;
  const glued = new RegExp(
    `<\\s*${NUM}[A-Za-z]|${NUM}[A-Za-z]\\s*[-–—]|[-–—]\\s*${NUM}[A-Za-z]|up\\s*to\\s*${NUM}[A-Za-z]`, 'i'
  ).test(seg);
  let m = seg.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (m) return glued ? { damaged: true } : { band: [+m[1], +m[2]] };
  m = seg.match(/up\s*to\s*(\d+(?:\.\d+)?)/i);
  if (m) return glued ? { damaged: true } : { band: [null, +m[1]] };
  m = seg.match(/<\s*(\d+(?:\.\d+)?)/);
  if (m) return glued ? { damaged: true } : { band: [null, +m[1]] };
  m = seg.match(/>\s*(\d+(?:\.\d+)?)/);
  if (m) return glued ? { damaged: true } : { band: [+m[1], null] };
  return null;
}

/** Build one validated test result. Returns null only when the number itself
    is unusable (caller records it as unresolved instead of guessing). */
function buildTest(key, hit, namePrinted, sex) {
  const t = TEST_LIBRARY[key];
  let value = ocrNum(hit.raw);
  if (!Number.isFinite(value)) return null;
  const confused = /[OolI]/.test(String(hit.raw));

  // unit harmonization for WBC/platelets reported in 10^3/µL or millions/lakhs
  const unitStr = (hit.unitPrinted || '').toLowerCase();
  if ((key === 'wbc' || key === 'platelets') && /10\^?3|x10|thousand/.test(unitStr)) value *= 1000;
  if ((key === 'wbc' || key === 'platelets') && /million|mn\b/.test(unitStr)) value *= 1000000;
  if (/\bla[ck]h?s?\b/.test(unitStr)) value *= 100000;

  const [typLo, typHi] = refsFor(t, sex);
  // Prefer the laboratory's stated interval; fall back to the typical band
  // when the printed one is missing or OCR-damaged (>10x off typical).
  let lo = typLo, hi = typHi, refSource = 'typical', note = null;
  const printed = parsePrintedRange(hit.after);
  if (printed && printed.damaged) {
    note = 'laboratory interval unclear in scan — typical band used';
  }
  if (printed && printed.band) {
    const [pLo, pHi] = printed.band;
    // A printed low bound of 0 ("0 - 40") is legitimate, not damage.
    const loBad = pLo != null && pLo > 0 && pLo < typLo / 10;
    const damaged =
      (pLo != null && pHi != null && (pLo > pHi || loBad || pHi > typHi * 10)) ||
      (pLo == null && pHi != null && pHi > typHi * 10) ||
      (pHi == null && pLo != null && pLo > 0 && pLo < typLo / 10);
    if (!damaged) { lo = pLo; hi = pHi; refSource = 'lab'; }
    else note = 'laboratory interval unclear in scan — typical band used';
  }

  let flag = 'normal';
  if (lo != null && value < lo) flag = 'low';
  else if (hi != null && value > hi) flag = 'high';
  if (flag !== 'normal') {
    const edge = flag === 'high' ? hi : lo;
    if (edge && Math.abs(value - edge) / Math.abs(edge) <= 0.04) flag = 'borderline';
  }

  // Confidence: never silently bless implausible or unit-less numbers.
  const plausible = value > 0 && value >= typLo / 10 && value <= typHi * 10;
  const canon = hit.unitPrinted ? UNIT_CANON[hit.unitPrinted.toLowerCase()] : null;
  const unitMismatch = hit.unitPrinted && canon && canon !== t.unit &&
    !/10\^?3|x10|thousand|million|mn\b|la[ck]h?s?\b/i.test(unitStr);
  let confidence = 'high';
  if (!plausible) { confidence = 'low'; note = 'outside plausible range — verify decimal point/units'; }
  else if (!hit.unitPrinted) {
    if (value < typLo || value > typHi) { confidence = 'low'; note = 'unit not stated and value outside typical band — verify'; }
    else { confidence = 'medium'; note = 'unit not stated in report'; }
  }
  else if (unitMismatch) { confidence = 'medium'; note = `unit ${hit.unitPrinted} differs from expected ${t.unit} — verify`; }
  else if (confused) { confidence = 'medium'; note = 'characters uncertain in scan'; }
  else if (note) confidence = 'medium';

  return {
    key, name: t.name, namePrinted, value, unit: t.unit, unitPrinted: hit.unitPrinted,
    refLow: lo, refHigh: hi, refSource, flag, category: t.category, confidence, note
  };
}

function mk(key, value, sex) {
  const t = TEST_LIBRARY[key];
  const [lo, hi] = refsFor(t, sex);
  let flag = 'normal';
  if (value > hi) flag = 'high';
  else if (value < lo) flag = 'low';
  return { key, name: t.name, value, unit: t.unit, refLow: lo, refHigh: hi, flag, category: t.category, confidence: 'high', refSource: 'typical', note: null };
}

function dedupe(tests) {
  const rank = { high: 2, medium: 1, low: 0 };
  const score = t => (rank[t.confidence] ?? 1) * 2 + (t.flag !== 'normal' ? 1 : 0);
  const seen = new Map();
  for (const t of tests) {
    const prev = seen.get(t.key);
    if (!prev || score(t) > score(prev)) seen.set(t.key, t);
  }
  return [...seen.values()];
}

function dedupeUnresolved(items) {
  const seen = new Map();
  for (const u of items) if (!seen.has(u.key)) seen.set(u.key, u);
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
  // Text recognized in the browser by the OCR step (images, or PDFs without a
  // text layer) arrives with the upload so the same extraction rules run on it.
  const ocrText = typeof ctx.ocrText === 'string' ? ctx.ocrText.trim() : '';
  if (/\.pdf$/i.test(filename || '') || (mime === 'application/pdf')) {
    rawText = extractPdfText(buffer);
    mode = rawText ? 'Digital PDF text layer parsed' : 'No text layer found (likely scanned image)';
    if (!rawText && ocrText) { rawText = ocrText; mode = 'Recognized from the scanned pages (in-browser OCR)'; }
  } else if (/\.(txt|text)$/i.test(filename || '')) {
    rawText = buffer.toString('utf8');
    mode = 'Plain text ingested';
  } else {
    rawText = ocrText;
    const words = ocrText ? ocrText.split(/\s+/).length : 0;
    mode = !ocrText
      ? 'No text recognized from this image — please review and enter values manually'
      : ctx.ocrSource === 'server'
        ? `Image text recognized on the server (OCR fallback) — ${words} word(s)`
        : `Image text recognized in your browser (OCR) — ${words} word(s)`;
  }
  stages.push({ stage: 'OCR / document parsing', status: rawText ? 'ok' : 'warn', detail: mode });

  const structured = structuredFromText(rawText, ctx);
  const flags = structured.flags, tests = structured.tests;
  stages.push({
    stage: 'Safety pre-check',
    status: 'ok',
    detail: flags.length ? 'Embedded instructions detected and ignored (prompt-injection guard)' : 'No embedded instruction content honored'
  });

  stages.push({
    stage: 'Medical entity extraction',
    status: tests.length ? 'ok' : 'warn',
    detail: tests.length ? `${tests.length} analytes recognized` : 'No known analytes auto-detected — manual review suggested'
  });
  stages.push({ stage: 'Value normalization & reference ranges', status: 'ok', detail: `${tests.filter(t => t.flag !== 'normal').length} value(s) outside typical reference band` });
  stages.push({ stage: 'Structured health data', status: 'ok', detail: 'Saved to your health graph' });

  return { stages, structured };
}

function observationFor(t) {
  const dir = t.flag === 'high' ? 'above' : t.flag === 'borderline' ? 'near the upper edge of' : 'below';
  const band = t.refLow == null && t.refHigh == null ? 'no stated band'
    : t.refLow == null ? `under ${t.refHigh}` : t.refHigh == null ? `over ${t.refLow}` : `${t.refLow}–${t.refHigh}`;
  return `${t.name} is ${dir} the typical range (${t.value} ${t.unit}, usual band ${band}).`;
}

/** Structured result from recognized text — shared by the upload pipeline and
    the "re-extract from corrected OCR text" flow, so both produce identical
    shapes (tests, observations, report date, lab name, safety flags). */
export function structuredFromText(rawText, ctx = {}) {
  const { text, flags } = normalizeText(rawText);
  const { tests, unresolved } = extractEntities(text, ctx.sex);
  // Only confident values feed observations; low-confidence numbers are shown
  // for review but never asserted as facts.
  const usable = tests.filter(t => t.confidence !== 'low');
  return {
    reportDate: parseReportDate(text) || ctx.fallbackDate || null,
    labName: parseLabName(text),
    tests,
    unresolved,
    observations: usable.filter(t => t.flag !== 'normal').map(t => ({ key: t.key, message: observationFor(t) })),
    flags,
    extractedAt: new Date().toISOString()
  };
}

/**
 * MODEL 5 — HEALTH EXPLANATION ASSISTANT.
 * Converts structured data into careful, non-diagnostic plain language.
 */
export function explainReport(structured, trendInfo = {}) {
  const lines = [];
  lines.push(`Report${structured.reportDate ? ` dated ${fmt(structured.reportDate)}` : ''}${structured.labName ? ` · ${structured.labName}` : ''}`);
  const unresolved = structured.unresolved || [];
  if (!structured.tests.length) {
    lines.push('We could not confidently recognize standard test values in this document. You can add readings manually so trends and guidance stay up to date.');
    if (unresolved.length) lines.push(`Seen but unreadable: ${unresolved.map(u => u.name).join(', ')} — the names were recognized but their values were not legible.`);
    return lines.join('\n');
  }
  const usable = structured.tests.filter(t => t.confidence !== 'low');
  const abnormal = usable.filter(t => t.flag !== 'normal');
  const normalCount = usable.length - abnormal.length;
  if (normalCount) lines.push(`${normalCount} value(s) are within their typical reference band.`);
  for (const t of abnormal.slice(0, 6)) {
    const what = PLAIN_LANGUAGE[t.key] || 'a measured health indicator';
    lines.push(`${t.name} (${t.value} ${t.unit}) is ${t.flag === 'borderline' ? 'close to the edge of' : t.flag === 'high' ? 'above' : 'below'} the laboratory's usual band — this ${what}.`);
  }
  const lowNames = structured.tests.filter(t => t.confidence === 'low').map(t => t.name);
  const needReview = lowNames.length + unresolved.length;
  if (needReview) {
    const names = [...lowNames, ...unresolved.map(u => u.name)];
    lines.push(`${needReview} value(s) need${needReview === 1 ? 's' : ''} review (${names.slice(0, 6).join(', ')}) — shown separately, not used for trends.`);
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
