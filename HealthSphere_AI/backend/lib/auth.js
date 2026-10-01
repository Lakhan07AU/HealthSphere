import crypto from 'node:crypto';
import { db, persist } from './db.js';
import { uid } from './util.js';

const SESSION_DAYS = 7;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function registerUser({ email, name, password }) {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (!name) throw new Error('Name is required.');
  if (!password || String(password).length < 6) throw new Error('Password must be at least 6 characters.');
  if (db.users.some(u => u.email === email)) throw new Error('An account with this email already exists.');
  const { salt, hash } = hashPassword(String(password));
  const user = { id: uid('usr'), email, name, passwordSalt: salt, passwordHash: hash, createdAt: new Date().toISOString() };
  db.users.push(user);
  persist();
  return user;
}

function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString()
  });
  // keep sessions bounded
  if (db.sessions.length > 500) db.sessions = db.sessions.slice(-300);
  persist();
  return token;
}

export function loginUser({ email, password }) {
  email = String(email || '').trim().toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(String(password || ''), user.passwordSalt, user.passwordHash)) {
    throw new Error('Invalid email or password.');
  }
  const token = issueSession(user.id);
  return { user, token };
}

export function changePassword(userId, currentPassword, newPassword) {
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found.');
  if (!verifyPassword(String(currentPassword || ''), user.passwordSalt, user.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }
  if (!newPassword || String(newPassword).length < 6) throw new Error('New password must be at least 6 characters.');
  const { salt, hash } = hashPassword(String(newPassword));
  user.passwordSalt = salt;
  user.passwordHash = hash;
  persist();
}

export function parseToken(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [] : [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
    }).filter(a => a.length === 2)
  );
  let token = cookies.hs_token;
  const authz = req.headers.authorization || '';
  if (!token && authz.startsWith('Bearer ')) token = authz.slice(7);
  return token || null;
}

export function getAuthedUser(req) {
  const token = parseToken(req);
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  if (session.role && session.role !== 'patient') return null;
  return db.users.find(u => u.id === session.userId) || null;
}

export function logoutToken(req) {
  const token = parseToken(req);
  if (token) {
    db.sessions = db.sessions.filter(s => s.token !== token);
    persist();
  }
}

export function audit(userId, action, detail = '') {
  const list = collSafe(userId);
  list.push({ ts: new Date().toISOString(), action, detail: String(detail).slice(0, 200) });
  if (list.length > 400) db.audit[userId] = list.slice(-300);
  persist();
}

function collSafe(userId) {
  if (!db.audit[userId]) db.audit[userId] = [];
  return db.audit[userId];
}

/* ---------------- Admin access ----------------
   ADMIN_EMAILS env var (comma-separated) controls membership. When unset,
   no one is admin by default (deny-by-default — the demo account must
   never be privileged). */
const DEFAULT_ADMIN_EMAILS = [];

export function isAdmin(user) {
  if (!user || !user.email) return false;
  const fromEnv = String(process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
  if (!list.length) {
    if (process.env.ADMIN_EMAILS !== undefined) return false;
    // Back-compat fallback for existing local dev DBs that relied on the
    // old default: warn loudly instead of silently granting.
    console.warn('[auth] ADMIN_EMAILS is unset — no admin users. Set ADMIN_EMAILS to enable the admin panel.');
    return false;
  }
  return list.includes(String(user.email).toLowerCase());
}
