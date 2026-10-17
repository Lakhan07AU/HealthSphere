import './_testenv.mjs';
import assert from 'node:assert';
import { processDocument, explainReport, extractEntities, parseReportDate, structuredFromText } from '../lib/extraction.js';

/* Regression tests for photographed multi-column lab tables.
   The LFT text below is a derived-synthetic transcription of the failing
   S.N. Medical College report layout (test names, values, units, reference
   intervals preserved for validation; patient identifiers redacted). It is a
   software-testing fixture, not clinical ground truth. */

const LFT = `S.N. Medical College, Agra, Uttar Pradesh, India
24 HOURS CENTRAL LABORATORY
Date : 24-Sep-2026
Name : PATIENT NAME REDACTED
Reg/Ref: REG-NUMBER-REDACTED Collected At : Main Lab - G
Ref.By : Dr. UROLOGY Age/Gender : 42 Yrs./Female
Receipt : NA Phone : 0000000000 : OPD
Requested Test : KFT, LFT, cbc, ELECTROLYTES
Coll Time : 24-Sep-2026 12:01 Validate : 24-Sep-2026 17:16 Prn. Time : 24-Sep-2026 20:09
Investigation Observed Values Units Biological Ref. Interval
LIVER FUNCTION TEST
Sample Type - Serum
Bilirubin, Total
Method - Malloy Evelyn Modified 0.3 mg/dl 0.3 - 1.2
Bilirubin, Direct
Method - Malloy Evelyn Modified 0.1 mg/dl UP TO 0.2
Bilirubin, Indirect
Method - Calculated 0.2 mg/dl 0.2 - 0.7
Total Proteins
Method - Biuret 5.4 gm/dL 6.4 - 8.3
Albumin
Method - Bromocresol Green 3.00 gm/dL 3.5 - 5.2
Globulins
Method - Calculated 2.4 gm/dL 2.0 - 3.5
A/G Ratio
Method - Calculated 1.25 : 1 Ratio
SGOT
Method - IFCC without P-5-P 39.02 IU/L 0 - 40
SGPT
Method - IFCC without P-5-P 33.17 IU/L < 34
Serum Alkaline Phosphatase
Method - DGKC & SCE 202.7 IU/L < 240
Status : Final
Page 2 of 2`;

const out = processDocument(
  { filename: 'lft-photo.jpeg', mime: 'image/jpeg', size: 85547, buffer: Buffer.from('img') },
  { sex: 'female', fallbackDate: '2026-10-15', ocrText: LFT }
);
const t = Object.fromEntries(out.structured.tests.map(x => [x.key, x]));

// all nine LFT analytes recognized with exact values
for (const k of ['bilirubin_total', 'bilirubin_direct', 'bilirubin_indirect',
  'total_protein', 'albumin', 'globulin', 'ast', 'alt', 'alp']) {
  assert.ok(t[k], `${k} extracted`);
  assert.equal(t[k].confidence, 'high', `${k} high confidence`);
  assert.equal(t[k].refSource, 'lab', `${k} uses the laboratory's stated interval`);
}
assert.equal(t.bilirubin_total.value, 0.3, 'total bilirubin value');
assert.equal(t.bilirubin_direct.value, 0.1, 'direct bilirubin value');
assert.equal(t.bilirubin_indirect.value, 0.2, 'indirect bilirubin value');
assert.equal(t.total_protein.value, 5.4, 'total protein value');
assert.equal(t.total_protein.unit, 'g/dL', 'gm/dL normalized to g/dL');
assert.equal(t.total_protein.unitPrinted, 'gm/dL', 'original unit preserved');
assert.equal(t.albumin.value, 3.0, 'albumin value');
assert.equal(t.globulin.value, 2.4, 'globulin value');
assert.equal(t.ast.value, 39.02, 'SGOT value');
assert.equal(t.ast.unit, 'U/L', 'IU/L normalized to U/L');
assert.equal(t.ast.unitPrinted, 'IU/L', 'original IU/L preserved');
assert.equal(t.alt.value, 33.17, 'SGPT value');
assert.equal(t.alp.value, 202.7, 'alkaline phosphatase value');

// laboratory's stated intervals drive the flags (UP TO / "<" forms)
assert.deepEqual([t.bilirubin_total.refLow, t.bilirubin_total.refHigh], [0.3, 1.2], 'total bilirubin lab band');
assert.deepEqual([t.bilirubin_direct.refLow, t.bilirubin_direct.refHigh], [null, 0.2], 'UP TO 0.2 band');
assert.deepEqual([t.alt.refLow, t.alt.refHigh], [null, 34], '< 34 band');
assert.deepEqual([t.alp.refLow, t.alp.refHigh], [null, 240], '< 240 band');
assert.equal(t.bilirubin_direct.flag, 'normal', 'direct bilirubin within lab band');
assert.equal(t.alt.flag, 'normal', 'SGPT within lab band');
assert.equal(t.total_protein.flag, 'low', 'total protein below lab band');
assert.equal(t.albumin.flag, 'low', 'albumin below lab band');

// the "Receipt : NA" trap must not fabricate a sodium result
assert.ok(!('sodium' in t), 'no sodium false positive from Receipt: NA + phone digits');
assert.ok(!('potassium' in t), 'no potassium false positive');
assert.equal(out.structured.tests.length, 9, 'exactly the nine LFT analytes, nothing extra');

// report metadata
assert.equal(out.structured.reportDate, '2026-09-24', 'LFT report date parsed');
assert.match(out.structured.labName || '', /central laboratory/i, 'lab name detected');
assert.equal(out.structured.unresolved.length, 0, 'nothing left unreadable');

// summary explains abnormal values and stays informational
const summary = explainReport(out.structured);
assert.match(summary, /Total protein.*below|Albumin.*below/, 'summary names low values');
assert.match(summary, /informational, not a diagnosis/i, 'safety framing kept');

// ---- bare "NA" must never become sodium, even on its own ----
{
  const { tests } = extractEntities('Receipt : NA\nPhone : 0000000000\nStatus : Final', 'female');
  assert.ok(!tests.some(x => x.key === 'sodium'), 'standalone NA receipt yields no sodium');
}

// ---- digital-PDF row shape: name / value / unit / range on separate lines ----
{
  const pdf = `CLINICAL PATHOLOGY & HEMATOLOGY SECTION
Test Name
Result
Unit
Reference Interval
HEMOGLOBIN (Hb)
13.3
gm/dL
13-17
HEMATOCRIT (HCT/PCV)
40.9
%
40-50
TOTAL WBC COUNT
7.8
10^3/µL
4-11`;
  const { tests } = extractEntities(pdf, 'male');
  const m = Object.fromEntries(tests.map(x => [x.key, x]));
  assert.equal(m.hemoglobin.value, 13.3, 'next-line hemoglobin value');
  assert.equal(m.hematocrit.value, 40.9, 'next-line hematocrit value');
  assert.equal(m.wbc.value, 7800, 'next-line WBC with 10^3 multiplier');
  assert.equal(m.hemoglobin.confidence, 'high', 'hemoglobin high confidence');
}

// ---- a competing test name must not be misread (MCH line is not hemoglobin) ----
{
  const { tests } = extractEntities('MCH (Mean Corpus Haemoglobin) 28.8 pg\n27-32', 'male');
  assert.ok(!tests.some(x => x.key === 'hemoglobin'), 'MCH row is not claimed as hemoglobin');
}

// ---- range-only rows resolve to "seen but unreadable", never a fabricated value ----
{
  const { tests, unresolved } = extractEntities('Total Leukocyte Count\n4000 - 11000', 'male');
  assert.ok(!tests.some(x => x.key === 'wbc'), 'range bounds are not mistaken for results');
  assert.ok(unresolved.some(u => u.key === 'wbc'), 'WBC reported as unreadable');
}

// ---- implausible magnitudes are flagged low, never silently blessed ----
{
  const { tests } = extractEntities('Platelet Count 165 Lac cells\n1.50 - 4.50', 'male');
  const p = tests.find(x => x.key === 'platelets');
  assert.ok(p, 'platelet row recognized');
  assert.equal(p.confidence, 'low', 'absurd magnitude flagged low');
  assert.match(p.note || '', /plausible|decimal/i, 'note explains the problem');
}

// ---- mismatched units cap confidence instead of asserting facts ----
{
  const { tests } = extractEntities('Uric Acid 8 %\n3.5-7.2', 'male');
  const u = tests.find(x => x.key === 'uric_acid');
  assert.ok(u, 'uric acid recognized');
  assert.equal(u.confidence, 'medium', 'wrong-unit value capped at medium');
}

// ---- noisy phone-photo OCR of the same LFT layout must still resolve ----
{
  const noisy = `LIVER FUNCTION TEST
Sample Type - Serum
Bilirubin,  Total
Method - Malloy Evelyn Modified   0.3   mg/dl   0.3 - 1.2
SGOT
Method - IFCC without P-5-P   39.O2   IU/L   0 - 40
SGPT
Method - IFCC without P-5-P   33.17   IU/L   < 34
Serum Alkaline Phosphatase
Method - DGKC & SCE   2O2.7   IU/L   < 24O`;
  const { tests } = extractEntities(noisy, 'female');
  const m = Object.fromEntries(tests.map(x => [x.key, x]));
  assert.equal(m.bilirubin_total.value, 0.3, 'noisy total bilirubin');
  assert.equal(m.ast.value, 39.02, 'O-for-zero repaired in SGOT value');
  assert.equal(m.ast.confidence, 'medium', 'repaired digits capped at medium');
  assert.match(m.ast.note || '', /uncertain/i, 'repair disclosed in note');
  assert.equal(m.alt.value, 33.17, 'SGPT value');
  assert.equal(m.alp.value, 202.7, 'O-for-zero repaired in ALP value');
  assert.equal(m.alp.refSource, 'typical', 'glued band "< 24O" rejected, typical used');
  assert.equal(m.alp.confidence, 'medium', 'damaged band disclosed via medium confidence');
  assert.ok(!('sodium' in m), 'no sodium in noisy text either');
}

// ---- alias containing digits must not misposition the value ----
{
  const { tests } = extractEntities('Vitamin B12 1483 pg/mL\n197-771', 'male');
  const b = tests.find(x => x.key === 'vitamin_b12');
  assert.ok(b && b.value === 1483, 'B12 value parsed despite digits in alias');
}

// ---- page markers and ratio fragments are never values ----
{
  const { tests, unresolved } = extractEntities('Page 2 of 2\nStatus : Final', 'male');
  assert.equal(tests.length, 0, 'page markers yield nothing');
  assert.equal(unresolved.length, 0, 'page markers anchor nothing');
}

// ---- OCR provenance is recorded in the pipeline stages ----
{
  const img = { filename: 'photo.jpeg', mime: 'image/jpeg', size: 10, buffer: Buffer.from('x') };
  const fromBrowser = processDocument(img, { ocrText: 'HbA1c 6.0 %', ocrSource: 'browser' });
  const ocrStage = fromBrowser.stages.find(s => s.stage === 'OCR / document parsing');
  assert.match(ocrStage.detail, /in your browser/, 'browser OCR provenance recorded');
  const fromServer = processDocument(img, { ocrText: 'HbA1c 6.0 %', ocrSource: 'server' });
  const srvStage = fromServer.stages.find(s => s.stage === 'OCR / document parsing');
  assert.match(srvStage.detail, /on the server.*fallback/, 'server fallback provenance recorded');
  const noText = processDocument(img, { ocrText: '' });
  const emptyStage = noText.stages.find(s => s.stage === 'OCR / document parsing');
  assert.equal(emptyStage.status, 'warn', 'empty OCR still warns');
  assert.equal(noText.structured.tests.length, 0, 'empty OCR yields no tests');
}

// ---- zero-case messages are unchanged; garbage dates are rejected ----
{
  const empty = structuredFromText('Dear doctor, please find attached nothing measurable.', {});
  assert.equal(empty.tests.length, 0, 'no analytes in prose');
  const msg = explainReport({ tests: [], unresolved: [] });
  assert.ok(msg.includes('We could not confidently recognize standard test values in this document.'), 'legacy failure sentence intact');
  assert.equal(parseReportDate('MRN 20251001816 ref 41/05/4030'), null, 'impossible date rejected');
  assert.equal(parseReportDate('Report Date: 20 Aug 2026'), '2026-08-20', 'valid date still parsed');
}

console.log('[PASS] lft-layout.test.mjs — photographed-table extraction, aliases, units, ranges, confidence OK');
