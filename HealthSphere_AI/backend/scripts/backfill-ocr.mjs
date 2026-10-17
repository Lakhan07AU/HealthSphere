/* One-shot repair: image reports whose browser OCR produced no text.
   For each image report with empty ocrText and a readable stored file, run
   server-side OCR, re-extract values, swap this report's metrics (same rule
   as the "re-extract" route: low-confidence never merges), and persist.

   STOP THE SERVER FIRST (both write data/db.json):
     Get-Process node | Stop-Process -Force
     node scripts/backfill-ocr.mjs
   Run from the backend/ directory. */
import { db, persist, coll } from '../lib/db.js';
import { readFile } from '../lib/storage.js';
import { recognizeImage } from '../lib/ocr-server.js';
import { structuredFromText, explainReport } from '../lib/extraction.js';
import { audit } from '../lib/auth.js';
import { uid, todayISO } from '../lib/util.js';

let scanned = 0, repaired = 0, noFile = 0, noText = 0;
for (const [userId, list] of Object.entries(db.reports || {})) {
  for (const r of list) {
    const isImage = /^image\//.test(r.mime || '') || /\.(png|jpe?g)$/i.test(r.filename || '');
    if (!isImage) continue;
    if ((r.ocrText || '').trim()) continue;
    if (((r.structured || {}).tests || []).length) continue;
    if (!r.storedName) { noFile++; continue; }
    scanned++;
    let data = null;
    try { data = await readFile(r.storedName, r); } catch { data = null; }
    if (!data?.buffer?.length) {
      console.log(`SKIP ${r.filename}: stored file unreadable`);
      noFile++;
      continue;
    }
    let ocr = null;
    try { ocr = await recognizeImage(data.buffer); } catch { ocr = null; }
    if (!ocr?.text) {
      console.log(`EMPTY ${r.filename}: server OCR found no text`);
      noText++;
      continue;
    }
    // Keep the record's original date (upload-date fallback), mirroring the
    // re-extract route — metrics must land on the original timeline.
    const structured = structuredFromText(ocr.text, {
      fallbackDate: r.structured?.reportDate || (r.uploadedAt || todayISO()).slice(0, 10)
    });
    r.ocrText = ocr.text.slice(0, 30000);
    r.structured = structured;
    r.summaryText = explainReport(structured, {});
    for (const st of (r.pipeline || [])) {
      if (st.stage === 'OCR / document parsing') {
        st.status = 'ok';
        st.detail = `Image text recognized on the server (OCR fallback) — ${ocr.words} word(s)`;
      }
      if (st.stage === 'Medical entity extraction') {
        st.status = structured.tests.length ? 'ok' : 'warn';
        st.detail = structured.tests.length
          ? `${structured.tests.length} analyte(s) recognized via server OCR fallback`
          : 'No known analytes auto-detected — manual review suggested';
      }
    }
    // Swap this report's metrics (mirror the re-extract route).
    db.metrics[userId] = (db.metrics[userId] || []).filter(m => m.source !== `report:${r.id}`);
    const date = structured.reportDate || (r.uploadedAt || todayISO()).slice(0, 10);
    for (const t of structured.tests || []) {
      if (t.confidence === 'low') continue;
      const dup = db.metrics[userId].some(m => m.key === t.key && m.date === date && Number(m.value) === t.value);
      if (!dup) db.metrics[userId].push({
        id: uid('met'), key: t.key, value: t.value, unit: t.unit, date,
        source: `report:${r.id}`, flag: t.flag, label: `${t.name} — ${t.unit}`
      });
    }
    audit(userId, 'report_reextracted', `${r.filename} — ${structured.tests.length} analyte(s) via server OCR`);
    repaired++;
    console.log(`OK ${r.filename}: ${structured.tests.length} analyte(s) ` +
      `[${(structured.tests || []).map(t => `${t.key}=${t.value}${t.confidence !== 'high' ? `(${t.confidence})` : ''}`).join(', ')}] ` +
      `unresolved=${(structured.unresolved || []).length}`);
  }
}
persist();
console.log(`\nscanned=${scanned} repaired=${repaired} nofile=${noFile} notext=${noText}`);
