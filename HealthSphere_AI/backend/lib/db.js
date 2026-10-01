import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaults() {
  return {
    users: [],
    sessions: [],
    profiles: {},
    families: {},
    reports: {},
    metrics: {},
    logs: {},
    plans: {},
    doctors: {},
    contacts: {},
    reminders: {},
    settings: {},
    sos: {},
    audit: {},
    doctorAccounts: [],
    storeOwnerAccounts: [],
    adminAccounts: [],
    consultTickets: [],
    consultAppointments: [],
    consultMessages: {},
    feedback: [],
    stores: []
  };
}

/* ---------------- storage backends ----------------
   1) SUPABASE_DB_URL set → the whole state lives in one jsonb row
      ("app_state") in a free Supabase Postgres project. Survives
      serverless cold starts (Vercel /tmp is wiped between invocations).
   2) otherwise → local data/db.json with atomic writes.
   Both modes export the exact same surface (db, persist, coll, objColl,
   DATA_DIR, UPLOAD_DIR), so no other module needs to change. */

let db = defaults();
let cloudClient = null; // pg Client when running in cloud mode

if (process.env.SUPABASE_DB_URL) {
  try {
    const pg = await import('pg');
    const client = new pg.default.Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    await client.query(
      `CREATE TABLE IF NOT EXISTS app_state (
         id    boolean PRIMARY KEY DEFAULT true,
         state jsonb NOT NULL)`
    );
    const r = await client.query('SELECT state FROM app_state WHERE id = true');
    if (r.rows.length) db = { ...defaults(), ...r.rows[0].state };
    // pg.Client queues queries on its single connection, so concurrent
    // persist() calls are safe; each write carries the full state.
    cloudClient = client;
    console.log('[db] using Supabase Postgres persistence');
  } catch (e) {
    console.error('[db] SUPABASE_DB_URL set but connection failed (' + e.message + ') — using local file instead.');
  }
}

/* Local paths — uploads always live here; db.json is the file-mode store. */
const DATA_DIR = process.env.HealthSphere_DATA_DIR
  || process.env.DATA_DIR
  || (!cloudClient && process.env.VERCEL ? '/tmp/healthsphere-data' : path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'db.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let persistImpl;
if (cloudClient) {
  persistImpl = () => {
    cloudClient.query(
      `INSERT INTO app_state (id, state) VALUES (true, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state`,
      [JSON.stringify(db)]
    ).catch(e => console.error('[db] cloud persist failed:', e.message));
  };
} else {
  try {
    db = { ...defaults(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch { /* fresh database */ }

  persistImpl = () => {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_PATH);
  };
}

process.on('exit', () => {
  try { if (!cloudClient) persist(); } catch { /* noop */ }
});

export function persist() { persistImpl(); }

/** Where data currently lives — used by the admin panel's system info. */
export function storageMode() {
  return cloudClient ? 'postgres' : 'json-file';
}

/** Get or create the per-user array for a collection. */
export function coll(name, userId) {
  if (!db[name][userId]) db[name][userId] = [];
  return db[name][userId];
}

export function objColl(name, userId) {
  if (!db[name][userId]) db[name][userId] = {};
  return db[name][userId];
}

export { db, ROOT, DATA_DIR };
