// Must be imported FIRST in every test file so the shared JSON db
// is redirected into a throwaway temp directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.HealthSphere_DATA_DIR) {
  const tmp = path.join(os.tmpdir(), `HealthSphere-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  process.env.HealthSphere_DATA_DIR = tmp;
}
