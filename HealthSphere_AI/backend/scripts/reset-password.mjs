/* Reset any local user's password.
   Usage: node scripts/reset-password.mjs <email> <newPassword>
   Stop the server first so it reloads the updated database. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.SUPABASE_DB_URL ? null : path.join(ROOT, 'data', 'db.json');

const [email, next] = process.argv.slice(2);
if (!email || !next) {
  console.error('Usage: node scripts/reset-password.mjs <email> <newPassword (min 6)>');
  process.exit(1);
}
if (String(next).length < 6) { console.error('Password must be at least 6 characters.'); process.exit(1); }
if (DB_PATH && !fs.existsSync(DB_PATH)) { console.error('No database found at', DB_PATH); process.exit(1); }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

let db;
if (DB_PATH) {
  db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
} else {
  console.error('SUPABASE_DB_URL mode is not supported by this script — edit via the app instead.');
  process.exit(1);
}

const user = db.users.find(u => u.email === String(email).trim().toLowerCase());
if (!user) {
  console.error('No account found for', email);
  console.error('Existing accounts:', db.users.map(u => u.email).join(', '));
  process.exit(1);
}

const { salt, hash } = hashPassword(String(next));
user.passwordSalt = salt;
user.passwordHash = hash;

// security: kill all their sessions so old logins are invalidated
const before = db.sessions.length;
db.sessions = db.sessions.filter(s => s.userId !== user.id);

fs.writeFileSync(DB_PATH + '.tmp', JSON.stringify(db, null, 1));
fs.renameSync(DB_PATH + '.tmp', DB_PATH);

console.log(`Password reset OK for ${user.email}`);
console.log(`Sessions invalidated: ${before - db.sessions.length}`);
