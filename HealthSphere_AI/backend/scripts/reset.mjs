import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const p of ['data/db.json', 'data/db.tmp']) {
  const f = path.join(root, p);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
const up = path.join(root, 'data', 'uploads');
if (fs.existsSync(up)) fs.rmSync(up, { recursive: true, force: true });
fs.mkdirSync(up, { recursive: true });
console.log('Database cleared. A fresh demo will be seeded on next start.');
