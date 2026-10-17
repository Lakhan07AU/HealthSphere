import Tesseract from 'tesseract.js';

/* ---------- Server-side OCR fallback (tesseract.js, same engine/version as
   the in-browser step) ----------
   Browser OCR is primary: it keeps images on-device and costs the server
   nothing. But when it fails (engine CDN blocked, old browser, crash), image
   uploads used to arrive with no text at all and could never extract. This
   fallback runs only for image uploads that arrived WITHOUT recognized text.

   Design: lazy (nothing downloads at boot), jobs serialized through one
   promise chain to bound memory, hard timeout, and NEVER throws — OCR is
   best-effort; the upload must always proceed so the user can correct text
   manually. Returns { text, words, ms } or null. */

let chain = Promise.resolve();

export function recognizeImage(buffer, { timeoutMs = 45000 } = {}) {
  const job = chain.then(() => runOnce(buffer, timeoutMs));
  // Keep the chain alive after failures so one bad image can't wedge the queue.
  chain = job.catch(() => {});
  return job;
}

async function runOnce(buffer, timeoutMs) {
  if (!buffer || !buffer.length) return null;
  const t0 = Date.now();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('server OCR timed out')), timeoutMs);
  });
  try {
    const out = await Promise.race([Tesseract.recognize(buffer, 'eng'), timeout]);
    const text = String(out?.data?.text || '').replace(/\r/g, '').trim();
    if (!text) return null;
    return { text, words: text.split(/\s+/).length, ms: Date.now() - t0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
