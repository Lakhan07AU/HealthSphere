import assert from 'node:assert';
import { buildSeries, analyzeSeries } from '../lib/trends.js';

// PRD §19 scenario: HbA1c 5.4 → 5.7 → 6.0
const series = buildSeries([
  { date: '2026-08-20', value: 6.0 }, { date: '2025-02-10', value: 5.7 },
  { date: '2024-03-15', value: 5.4 }
]);
assert.deepEqual(series.map(s => s.value), [5.4, 5.7, 6.0], 'series sorted ascending by date');

const a = analyzeSeries(series, 'hba1c');
assert.equal(a.status, 'ok');
assert.equal(a.direction, 'increasing', 'increasing trend detected');
assert.ok(a.slopePerYear > 0, 'positive slope per year');
assert.equal(a.n, 3);
assert.equal(a.confidence, 'moderate', 'confidence moderate at n=3');

// stability
const flat = buildSeries([
  { date: '2026-01-01', value: 74 }, { date: '2026-04-01', value: 75 },
  { date: '2026-07-01', value: 74.5 }
]);
assert.equal(analyzeSeries(flat, 'heart_rate').direction, 'stable', 'stable detected');

// sudden change
const jump = buildSeries([
  { date: '2026-01-01', value: 100 }, { date: '2026-02-01', value: 101 },
  { date: '2026-03-01', value: 99 }, { date: '2026-04-01', value: 130 }
]);
const ja = analyzeSeries(jump, 'total_cholesterol');
assert.equal(ja.suddenChange, true, 'sudden change detected');
assert.match(ja.suddenDetail || '', /Jumped/, 'sudden detail text');

// anomaly via z-score (n>=4)
assert.equal(ja.anomaly, true, 'anomaly flagged on outlier');

// missing data / staleness
const stale = buildSeries([{ date: '2024-01-01', value: 80 }]);
const sa = analyzeSeries(stale, 'weight_kg');
assert.equal(sa.stale, true, 'stale series flagged');
assert.ok(/No readings for \d+ days/.test(sa.missingNote), 'missing note text');

// empty
assert.equal(analyzeSeries([], 'hba1c').status, 'no_data', 'empty series handled');

console.log('[PASS] trends.test.mjs — trend engine OK');
