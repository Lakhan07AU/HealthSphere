import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { Client } = pg;

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

const USER_COLLECTIONS = [
  'profiles', 'families', 'reports', 'metrics', 'logs', 'plans',
  'doctors', 'contacts', 'reminders', 'sos', 'audit', 'settings'
];

const TOP_LEVEL_TABLES = [
  'users', 'sessions', 'doctorAccounts', 'storeOwnerAccounts',
  'consultTickets', 'consultAppointments',
  'consultMessages', 'feedback', 'stores'
];

let db = defaults();
let pgClient = null;
let pgEnabled = false;

const DATA_DIR = process.env.HealthSphere_DATA_DIR
  || process.env.DATA_DIR
  || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function pgTableName(name) {
  const map = {
    doctorAccounts: 'doctor_accounts',
    storeOwnerAccounts: 'store_owner_accounts',
    adminAccounts: 'admin_accounts',
    consultTickets: 'consult_tickets',
    consultAppointments: 'consult_appointments',
    consultMessages: 'consult_messages',
  };
  return map[name] || name;
}

/* Map lowercase PG column names back to camelCase JS keys */
const PG_TO_CAMEL = {
  passwordsalt: 'passwordSalt',
  passwordhash: 'passwordHash',
  createdat: 'createdAt',
  userid: 'userId',
  expiresat: 'expiresAt',
  updatedat: 'updatedAt',
  storedname: 'storedName',
  filebackend: 'fileBackend',
  cloudpublicid: 'cloudPublicId',
  fileresourcetype: 'fileResourceType',
  filedata: 'fileData',
  heightcm: 'heightCm',
  weightkg: 'weightKg',
  bloodgroup: 'bloodGroup',
  foodpreference: 'foodPreference',
  ageoryear: 'ageOrYear',
  cancerhistory: 'cancerHistory',
  geneticconditions: 'geneticConditions',
  recordedat: 'recordedAt',
  uploadedat: 'uploadedAt',
  summarytext: 'summaryText',
  durationmin: 'durationMin',
  meetinglink: 'meetingLink',
  ownername: 'ownerName',
  storename: 'storeName',
  storeid: 'storeId',
  ownerid: 'ownerId',
  licensenumber: 'licenseNumber',
  idproof: 'idProof',
  yearsexp: 'yearsExp',
  verificationstatus: 'verificationStatus',
  availabilitystatus: 'availabilityStatus',
  senderid: 'senderId',
  sendername: 'senderName',
  senderrole: 'senderRole',
  appointmentid: 'appointmentId',
  useremail: 'userEmail',
  patientid: 'patientId',
  doctorid: 'doctorId',
  ticketid: 'ticketId',
  scheduledat: 'scheduledAt',
  meetinglink: 'meetingLink',
  doctorname: 'doctorName',
  patientname: 'patientName',
  confirmedslot: 'confirmedSlot',
  sessionlink: 'sessionLink',
  sessionid: 'sessionId',
  assigneddoctorid: 'assignedDoctorId',
  preferreddoctorid: 'preferredDoctorId',
  preferreddoctorname: 'preferredDoctorName',
  preferredslots: 'preferredSlots'
};

function pgRowToCamel(row) {
  const result = {};
  for (const [k, v] of Object.entries(row)) {
    const key = PG_TO_CAMEL[k] || k;
    result[key] = v;
  }
  return result;
}

/* PostgreSQL folds unquoted identifiers to lowercase (passwordsalt, userid).
   Convert back to camelCase to match JS object keys. */
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[key] = typeof v === 'object' && v !== null ? toCamelCase(v) : v;
  }
  return result;
}

async function connectPostgres() {
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'healthsphere',
    ssl: false
  });
  await client.connect();

  const schemaPath = path.join(ROOT, 'lib', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
  }

  return client;
}

async function loadFromPostgres(client) {
  const d = defaults();

  for (const table of TOP_LEVEL_TABLES) {
    const pgName = pgTableName(table);
    try {
      const res = await client.query(`SELECT * FROM ${pgName}`);
      for (const row of res.rows) {
        const item = pgRowToCamel(row);
        if (table === 'users') d.users.push(item);
        else if (table === 'sessions') d.sessions.push(item);
        else if (table === 'doctorAccounts') d.doctorAccounts.push(item);
        else if (table === 'storeOwnerAccounts') d.storeOwnerAccounts.push(item);
        else if (table === 'adminAccounts') d.adminAccounts.push(item);
        else if (table === 'consultTickets') d.consultTickets.push(item);
        else if (table === 'consultAppointments') d.consultAppointments.push(item);
        else if (table === 'consultMessages') {
          const threadId = item.appointmentId || item.ticketId;
          if (!threadId) continue;
          if (!d.consultMessages[threadId]) d.consultMessages[threadId] = [];
          d.consultMessages[threadId].push(item);
        }
        else if (table === 'feedback') d.feedback.push(item);
        else if (table === 'stores') d.stores.push(item);
      }
    } catch (e) {
      console.error('[db] Could not load table', pgName, e.message);
    }
  }

  for (const collName of USER_COLLECTIONS) {
    try {
      const res = await client.query(
        `SELECT userid, data FROM user_collections WHERE collection = $1`,
        [collName]
      );
      for (const row of res.rows) {
        const item = pgRowToCamel(row);
        d[collName][item.userId] = item.data || (['plans', 'settings', 'profiles'].includes(collName) ? {} : []);
      }
    } catch (e) {
      console.error('[db] Could not load collection', collName, e.message);
    }
  }

  return d;
}

async function persistToPostgres(client) {
  await client.query('BEGIN');

  try {
    for (const table of TOP_LEVEL_TABLES) {
      const pgName = pgTableName(table);
      await client.query(`DELETE FROM ${pgName}`);
      let rows = [];
      if (table === 'users') rows = db.users;
      else if (table === 'sessions') rows = db.sessions;
      else if (table === 'doctorAccounts') rows = db.doctorAccounts;
      else if (table === 'storeOwnerAccounts') rows = db.storeOwnerAccounts;
      else if (table === 'adminAccounts') rows = db.adminAccounts;
      else if (table === 'consultTickets') rows = db.consultTickets;
      else if (table === 'consultAppointments') rows = db.consultAppointments;
      else if (table === 'consultMessages') {
        rows = Object.entries(db.consultMessages).flatMap(([threadId, list]) =>
          (list || []).map(m => ({ ...m, appointmentId: m.appointmentId || threadId, createdAt: m.createdAt || m.ts })));
      }
      else if (table === 'feedback') rows = db.feedback;
      else if (table === 'stores') rows = db.stores;

      for (const item of rows) {
        const cols = Object.keys(item);
        // Arrays/objects must be sent as JSON text for JSONB columns; node-postgres
        // would otherwise serialize arrays as Postgres array literals.
        const vals = Object.values(item).map(v =>
          (v !== null && typeof v === 'object' && !(v instanceof Date)) ? JSON.stringify(v) : v);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const colList = cols.join(', ');
        await client.query(`INSERT INTO ${pgName} (${colList}) VALUES (${placeholders})`, vals);
      }
    }

    for (const collName of USER_COLLECTIONS) {
      for (const [userId, data] of Object.entries(db[collName] || {})) {
        await client.query(`
          INSERT INTO user_collections (userid, collection, data, updatedat)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (userid, collection) DO UPDATE SET
            data = EXCLUDED.data, updatedat = NOW()
        `, [userId, collName, JSON.stringify(data || null)]);
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/* ---------- Blocking init with top-level await ---------- */
try {
  pgClient = await connectPostgres();
  pgEnabled = true;
  db = await loadFromPostgres(pgClient);
  console.log('[db] using PostgreSQL persistence (local)');
} catch (e) {
  console.error('[db] PostgreSQL unavailable — JSON file mode:', e.message);
  pgEnabled = false;
  pgClient = null;
  try { db = { ...defaults(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) }; } catch { /* fresh */ }
}

const persistToFile = () => {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_PATH);
};

const persistToDb = async () => {
  if (!pgEnabled || !pgClient) {
    persistToFile();
    return;
  }
  try {
    await persistToPostgres(pgClient);
  } catch (e) {
    console.error('[db] postgres persist failed, writing JSON fallback:', e.message);
    persistToFile();
  }
};

const persistImpl = pgEnabled ? persistToDb : persistToFile;

// Serialize all persistence. persistToPostgres runs a full snapshot
// (DELETE + INSERT) inside a single transaction on the shared pgClient;
// concurrent un-awaited calls used to interleave BEGIN/COMMIT on that one
// client, which aborted transactions and corrupted rows (e.g. users with
// mismatched password hashes). Chaining them guarantees only one snapshot
// runs at a time.
let persistChain = Promise.resolve();

process.on('exit', () => {
  try { persistImpl(); } catch { /* noop */ }
  try { if (pgClient) pgClient.end(); } catch { /* noop */ }
});

export function persist() {
  persistChain = persistChain
    .then(() => persistImpl())
    .catch(e => console.error('[db] persist error:', e.message));
  return persistChain;
}

export function storageMode() {
  return pgEnabled ? 'postgres' : 'json-file';
}

export function coll(name, userId) {
  if (!db[name][userId]) db[name][userId] = [];
  return db[name][userId];
}

export function objColl(name, userId) {
  if (!db[name][userId]) db[name][userId] = {};
  return db[name][userId];
}

export { db, ROOT, DATA_DIR };
