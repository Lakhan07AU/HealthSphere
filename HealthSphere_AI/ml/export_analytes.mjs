// Single source of truth: dump TEST_LIBRARY + PLAIN_LANGUAGE from the
// backend so the ML dataset builder can never drift from production aliases.
// Usage: node ml/export_analytes.mjs  (writes ml/data/analytes.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_LIBRARY } from '../backend/lib/extraction.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const plain = {};
try {
  const src = fs.readFileSync(path.join(here, '..', 'backend', 'lib', 'extraction.js'), 'utf8');
  const m = src.match(/const PLAIN_LANGUAGE = \{([\s\S]*?)\n\};/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.trim().match(/^(\w+):\s*'(.*)',?$/);
      if (kv) plain[kv[1]] = kv[2];
    }
  }
} catch { /* plain-language explanations are optional for the dataset */ }

const out = {
  exportedAt: new Date().toISOString(),
  source: 'backend/lib/extraction.js TEST_LIBRARY (+ PLAIN_LANGUAGE)',
  analytes: Object.entries(TEST_LIBRARY).map(([key, t]) => ({
    key, name: t.name, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh,
    category: t.category, aliases: t.aliases, explanation: plain[key] || null
  }))
};
fs.mkdirSync(path.join(here, 'data'), { recursive: true });
fs.writeFileSync(path.join(here, 'data', 'analytes.json'), JSON.stringify(out, null, 1));
console.log(`exported ${out.analytes.length} analytes -> ml/data/analytes.json`);
