import { linregSlope, mean, std } from './util.js';

/* ============================================================
   MODEL 2 — HEALTH TREND ENGINE
   Time-series analysis · trend detection · anomaly identification
   ============================================================ */

const SIGNIFICANCE = {
  // tolerance used to call a slope "meaningful" per metric key
  default: 0.03,
  hba1c: 0.1,          // % change per year considered meaningful
  glucose_fasting: 3,
  glucose_random: 5,
  total_cholesterol: 5,
  ldl: 5,
  hdl: 3,
  triglycerides: 8,
  bp_systolic: 3,
  bp_diastolic: 2,
  heart_rate: 3,
  weight: 1.5,
  hemoglobin: 0.4,
  tsh: 0.35,
  vitamin_d: 3,
  vitamin_b12: 30,
  creatinine: 0.08,
  sleep_hours: 0.4
};

export function buildSeries(entries) {
  const byDate = new Map();
  for (const e of entries) {
    const d = String(e.date).slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(Number(e.value));
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, vals]) => ({ date, value: mean(vals) }));
}

export function analyzeSeries(series, key) {
  if (!series || series.length === 0) return { status: 'no_data' };
  const n = series.length;
  const first = series[0], last = series[n - 1];
  const out = {
    status: 'ok',
    n,
    first,
    last,
    mean: mean(series.map(s => s.value)),
    daysSinceLast: Math.round((Date.now() - new Date(last.date + 'T00:00:00Z').getTime()) / 86400000)
  };

  if (n >= 2) {
    const points = series.map(s => ({ x: new Date(s.date + 'T00:00:00Z').getTime(), y: s.value }));
    // x is in epoch milliseconds → convert least-squares slope to per-day, then per-year
    const slopePerDay = linregSlope(points) * 86_400_000;
    out.slopePerYear = slopePerDay * 365.25;
    const span = Math.abs(out.mean) || 1;
    const tol = SIGNIFICANCE[key] ?? SIGNIFICANCE.default;
    const rel = Math.abs(out.slopePerYear);
    out.direction = rel < tol ? 'stable' : out.slopePerYear > 0 ? 'increasing' : 'decreasing';
    out.confidence = n >= 4 ? 'moderate–high' : n >= 3 ? 'moderate' : 'low';

    const recentDelta = last.value - first.value;
    out.totalChange = recentDelta;
    out.totalChangePct = first.value !== 0 ? (recentDelta / Math.abs(first.value)) * 100 : 0;

    const lastTwo = last.value - series[n - 2].value;
    const lastTwoPct = series[n - 2].value !== 0 ? (lastTwo / Math.abs(series[n - 2].value)) * 100 : 0;
    out.suddenChange = Math.abs(lastTwoPct) >= 15 && Math.abs(lastTwo) >= tol;
    if (out.suddenChange) out.suddenDetail = `${lastTwo > 0 ? 'Jumped' : 'Dropped'} ${Math.abs(lastTwoPct).toFixed(0)}% between the two most recent readings.`;
  }

  // anomaly detection via z-score on latest point
  if (n >= 4) {
    const hist = series.slice(0, -1).map(s => s.value);
    const sd = std(hist) || 1e-9;
    const z = (last.value - mean(hist)) / sd;
    out.latestZ = Math.round(z * 100) / 100;
    if (Math.abs(z) >= 2) out.anomaly = true;
  }

  // repeated abnormal values
  out.repeatedAbnormal = n >= 2 && series.slice(-2).every(s => s.flag && s.flag !== 'normal');

  // missing-data heuristic
  out.stale = out.daysSinceLast > 180;
  if (out.stale) out.missingNote = `No readings for ${out.daysSinceLast} days.`;

  out.text = describe(key, out);
  return out;
}

function describe(key, a) {
  if (a.status !== 'ok') return '';
  const k = labelOf(key);
  if (a.direction === 'increasing') return `${k} shows an increasing trend across your records (${fmt(a.first)} → ${fmt(a.last)}).`;
  if (a.direction === 'decreasing') return `${k} shows a decreasing trend across your records (${fmt(a.first)} → ${fmt(a.last)}).`;
  if (a.n >= 2) return `${k} has remained broadly stable (${fmt(a.first)} → ${fmt(a.last)}).`;
  return `${k}: single reading recorded.`;
}

function fmt(p) {
  return `${p.value} (${new Date(p.date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })})`;
}

export function labelOf(key) {
  return ({
    weight: 'Weight', bmi: 'BMI', hba1c: 'HbA1c', glucose_fasting: 'Fasting glucose', glucose_random: 'Random glucose',
    weight_kg: 'Weight',
    total_cholesterol: 'Total cholesterol', ldl: 'LDL cholesterol', hdl: 'HDL cholesterol', triglycerides: 'Triglycerides',
    bp_systolic: 'Systolic BP', bp_diastolic: 'Diastolic BP', heart_rate: 'Heart rate', hemoglobin: 'Hemoglobin',
    steps: 'Daily steps', exercise_minutes: 'Exercise minutes', sleep_hours: 'Sleep duration', hydration_liters: 'Hydration',
    mood_score: 'Self-reported wellbeing'
  })[key] || key.replace(/_/g, ' ');
}
