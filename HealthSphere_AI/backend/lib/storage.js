import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

/* ---------------- Report file storage (4 tiers, free tiers) ----------------
   Tier 1 — Supabase Storage: when SUPABASE_URL + SUPABASE_SERVICE_KEY are set,
   files live in a private bucket. Same free project that backs the database.
   Tier 1b — Cloudinary: when CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY +
   CLOUDINARY_API_SECRET are set (and Supabase Storage is not), files upload
   signed server-side to your Cloudinary cloud (generous free tier, no card).
   Delivery URLs are unlisted (random hex prefix) and the app still gates
   every download behind the owner's session — the /file endpoint proxies
   bytes, so keys and cloud URLs never reach the browser.
   Tier 2 — Database-embedded base64: small files (<= EMBED_MAX) when NO cloud
   backend is configured. Bytes ride inside the report record, so they survive
   wherever the database survives (including Vercel + Supabase Postgres).
   Tier 3 — Local disk (data/uploads): everything else. Fast and inspectable
   locally; ephemeral on Vercel (per-invocation only).

   Zero new dependencies: both cloud APIs are called with built-in fetch.

   Env:
     SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_STORAGE_BUCKET (="reports")
     CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
     CLOUDINARY_FOLDER (optional, defaults to "healthsphere")

   The record carries fileBackend ('supabase' | 'cloudinary' | 'local') and,
   for Cloudinary, cloudPublicId + fileResourceType; tier 2 adds fileData. */

const BUCKET_DEFAULT = 'reports';
const CLOUD_FOLDER_DEFAULT = 'healthsphere';

/** Files at/under this size get a database-embedded safety copy when
    no cloud backend is configured (tier 2). */
export const EMBED_MAX = 512 * 1024;

export function shouldEmbed(size) {
  return Number(size) > 0 && Number(size) <= EMBED_MAX;
}

function cfg() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || BUCKET_DEFAULT;
  const cloud = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const folder = (process.env.CLOUDINARY_FOLDER || CLOUD_FOLDER_DEFAULT).trim() || CLOUD_FOLDER_DEFAULT;
  return {
    url, key, bucket, supabase: Boolean(url && key),
    cloud, apiKey, apiSecret, folder, cloudinary: Boolean(cloud && apiKey && apiSecret),
  };
}

export function storageBackend() {
  const c = cfg();
  if (c.supabase) return 'supabase';
  if (c.cloudinary) return 'cloudinary';
  return 'local';
}

function safeName(storedName) {
  // storedName is server-generated (`hex_original`), but never trust a path.
  return path.basename(String(storedName || ''));
}

/** Cloudinary public_id for a stored file: folder + sanitized name. */
export function cloudPublicId(storedName, folder) {
  const base = safeName(storedName).replace(/\s+/g, '_').replace(/[^\w.\-]/g, '_').slice(0, 180) || 'file';
  const f = String(folder || CLOUD_FOLDER_DEFAULT).replace(/[^\w.\-/]/g, '').replace(/^\/+|\/+$/g, '') || CLOUD_FOLDER_DEFAULT;
  return `${f}/${base}`;
}

/* ---------------- Supabase helpers ---------------- */

function sbObjectUrl(c, name) {
  return `${c.url}/storage/v1/object/${encodeURIComponent(c.bucket)}/${encodeURIComponent(name)}`;
}

async function sbSave(c, name, buffer, mime) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(sbObjectUrl(c, name), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.key}`,
        apikey: c.key,
        'Content-Type': mime || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
      signal: ctrl.signal,
    });
    return r.ok;
  } finally { clearTimeout(t); }
}

async function sbRead(c, name) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(sbObjectUrl(c, name), {
      headers: { Authorization: `Bearer ${c.key}`, apikey: c.key },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

async function sbDelete(c, name) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    await fetch(`${c.url}/storage/v1/object/${encodeURIComponent(c.bucket)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [name] }),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}

/* ---------------- Cloudinary helpers (signed, server-side) ---------------- */

function cloudSign(params, secret) {
  const payload = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + secret;
  return crypto.createHash('sha1').update(payload).digest('hex');
}

function multipartBody(fields, fileField, filename, mime, buffer) {
  const boundary = '----hs' + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${String(filename).replace(/"/g, '')}"\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`, 'utf8'));
  parts.push(buffer);
  parts.push(Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function cloudSave(c, publicId, buffer, mime, filename) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: publicId.split('/').slice(0, -1).join('/') || c.folder, timestamp: String(timestamp) };
  const fields = { ...params, api_key: c.apiKey, signature: cloudSign(params, c.apiSecret) };
  const { body, contentType } = multipartBody(fields, 'file', safeName(filename || publicId), mime, buffer);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/auto/upload`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
      body,
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j?.public_id) return null;
    return { publicId: j.public_id, resourceType: j.resource_type || 'image' };
  } finally { clearTimeout(t); }
}

function cloudDeliveryUrl(c, publicId, resourceType) {
  const rt = resourceType === 'raw' ? 'raw' : 'image';
  return `https://res.cloudinary.com/${c.cloud}/${rt}/upload/${publicId.split('/').map(encodeURIComponent).join('/')}`;
}

async function cloudRead(c, publicId, resourceType) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(cloudDeliveryUrl(c, publicId, resourceType), { signal: ctrl.signal });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

async function cloudDelete(c, publicId, resourceType) {
  for (const rt of [resourceType === 'raw' ? 'raw' : 'image', 'raw']) {
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { public_id: publicId, timestamp };
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/${rt}/destroy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_id: publicId, api_key: c.apiKey, timestamp, signature: cloudSign(params, c.apiSecret) }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
      return;
    } catch { /* try next resource type */ }
  }
}

/* ---------------- Public API ---------------- */

/** Persist an uploaded report file.
    Returns { backend, publicId?, resourceType? } on success, null on failure. */
export async function saveFile(storedName, buffer, mime) {
  const name = safeName(storedName);
  if (!name) return null;
  const c = cfg();
  if (c.supabase) {
    try { return (await sbSave(c, name, buffer, mime)) ? { backend: 'supabase' } : null; }
    catch { return null; }
  }
  if (c.cloudinary) {
    try {
      const publicId = cloudPublicId(name, c.folder);
      const up = await cloudSave(c, publicId, buffer, mime, name);
      return up ? { backend: 'cloudinary', publicId: up.publicId, resourceType: up.resourceType } : null;
    } catch { return null; }
  }
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
    return { backend: 'local' };
  } catch { return null; }
}

/** Read a stored report file. `record` enables cloud + tier-2 embedded copies.
    Returns { buffer, backend } or null. */
export async function readFile(storedName, record = null) {
  const name = safeName(storedName);
  if (!name) return null;
  const c = cfg();
  // Recorded cloud backends first — cheapest correct hit.
  if (record?.fileBackend === 'cloudinary' && c.cloudinary && record.cloudPublicId) {
    try {
      const buf = await cloudRead(c, record.cloudPublicId, record.fileResourceType);
      if (buf) return { buffer: buf, backend: 'cloudinary' };
    } catch { /* fall through */ }
  }
  if (record?.fileBackend === 'supabase' && c.supabase) {
    try {
      const buf = await sbRead(c, name);
      if (buf) return { buffer: buf, backend: 'supabase' };
    } catch { /* fall through */ }
  }
  // Convention fallbacks (files from before fileBackend existed).
  if (c.supabase && !record?.fileBackend) {
    try {
      const buf = await sbRead(c, name);
      if (buf) return { buffer: buf, backend: 'supabase' };
    } catch { /* fall through */ }
  }
  if (record?.fileData) {
    try { return { buffer: Buffer.from(record.fileData, 'base64'), backend: 'db' }; }
    catch { /* fall through to disk */ }
  }
  if (c.cloudinary && !record?.fileBackend) {
    try {
      const buf = await cloudRead(c, cloudPublicId(name, c.folder));
      if (buf) return { buffer: buf, backend: 'cloudinary' };
    } catch { /* fall through */ }
  }
  try {
    const fp = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(fp)) return null;
    return { buffer: fs.readFileSync(fp), backend: 'local' };
  } catch { return null; }
}

/** Where does this record's file actually live right now?
    'supabase' | 'cloudinary' | 'db' | 'local' | 'missing' | 'none'. For the manager UI. */
export function locate(record) {
  if (!record?.storedName) return 'none';
  if (record.fileBackend === 'supabase' || record.fileBackend === 'cloudinary') return record.fileBackend;
  if (record.fileData) return 'db';
  try {
    if (fs.existsSync(path.join(UPLOAD_DIR, safeName(record.storedName)))) return 'local';
  } catch { /* ignore */ }
  // No recorded backend, no embedded copy, nothing on this server's disk —
  // but a configured cloud may hold files from before fileBackend existed.
  const c = cfg();
  if (c.supabase || c.cloudinary) return c.supabase ? 'supabase' : 'cloudinary';
  return 'missing';
}

/** Best-effort delete from whichever backend(s) hold the file. */
export async function deleteFile(storedName, record = null) {
  const name = safeName(storedName);
  if (!name) return;
  const c = cfg();
  if ((record?.fileBackend === 'cloudinary' || (!record?.fileBackend && c.cloudinary)) && c.cloudinary) {
    const publicId = record?.cloudPublicId || cloudPublicId(name, c.folder);
    try { await cloudDelete(c, publicId, record?.fileResourceType); } catch { /* noop */ }
  }
  if ((record?.fileBackend === 'supabase' || (!record?.fileBackend && c.supabase)) && c.supabase) {
    try { await sbDelete(c, name); } catch { /* noop */ }
  }
  try {
    const fp = path.join(UPLOAD_DIR, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch { /* noop */ }
}
