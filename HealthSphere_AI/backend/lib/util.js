import crypto from 'node:crypto';

export const uid = (p = 'id') => `${p}_${crypto.randomBytes(8).toString('hex')}`;

export function num(v) {
  if (v === null || v === undefined) return NaN;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = iso ? new Date(iso + 'T00:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function bmi(heightCm, weightKg) {
  const h = num(heightCm) / 100;
  const w = num(weightKg);
  if (!h || !w) return null;
  return round(w / (h * h), 1);
}

export function bmiCategory(v) {
  if (v == null) return '';
  if (v < 18.5) return 'Underweight';
  if (v < 25) return 'Healthy range';
  if (v < 30) return 'Overweight';
  return 'Obese range';
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
}

/** Least-squares slope of y over x (dates as ms). Returns units per day. */
export function linregSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const mx = mean(xs), my = mean(ys);
  let numr = 0, den = 0;
  for (let i = 0; i < n; i++) {
    numr += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : numr / den;
}
