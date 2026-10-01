import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveFile, readFile, deleteFile, storageBackend, shouldEmbed, locate, EMBED_MAX, cloudPublicId } from '../lib/storage.js';
import { UPLOAD_DIR } from '../lib/db.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
const savedEnv = {
  url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY,
  cloud: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET, folder: process.env.CLOUDINARY_FOLDER,
};
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_FOLDER']) delete process.env[k];

function restore() {
  globalThis.fetch = realFetch;
  const map = { SUPABASE_URL: savedEnv.url, SUPABASE_SERVICE_KEY: savedEnv.key, CLOUDINARY_CLOUD_NAME: savedEnv.cloud, CLOUDINARY_API_KEY: savedEnv.apiKey, CLOUDINARY_API_SECRET: savedEnv.apiSecret, CLOUDINARY_FOLDER: savedEnv.folder };
  for (const [k, v] of Object.entries(map)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
}

/* ---------- 1. local fallback (no env) ---------- */
assert.strictEqual(storageBackend(), 'local', 'backend defaults to local');
const tName = `test_${Date.now()}_r.pdf`;
const tBytes = Buffer.from('%PDF-1.4 storage test', 'utf8');
assert.strictEqual((await saveFile(tName, tBytes, 'application/pdf')).backend, 'local', 'local save');
assert.ok(fs.existsSync(path.join(UPLOAD_DIR, tName)), 'file on disk');
const got = await readFile(tName, null);
assert.ok(got && got.buffer.equals(tBytes) && got.backend === 'local', 'local round-trip');
await deleteFile(tName, null);
assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, tName)), 'local delete');
assert.strictEqual(await readFile(tName, null), null, 'missing file -> null');
assert.strictEqual(await readFile('../../evil.pdf', null), null, 'traversal blocked');
// tier-2 embedded copy needs no disk and no cloud
const emb = await readFile('ghost.pdf', { storedName: 'ghost.pdf', fileData: tBytes.toString('base64') });
assert.ok(emb && emb.buffer.equals(tBytes) && emb.backend === 'db', 'embedded record round-trip');
// embed size gate
assert.strictEqual(shouldEmbed(1), true, 'tiny embeds');
assert.strictEqual(shouldEmbed(EMBED_MAX), true, 'at cap embeds');
assert.strictEqual(shouldEmbed(EMBED_MAX + 1), false, 'over cap skips');
assert.strictEqual(shouldEmbed(0), false, 'empty never embeds');
// locate()
assert.strictEqual(locate(null), 'none', 'locate none');
assert.strictEqual(locate({}), 'none', 'locate empty');
assert.strictEqual(locate({ storedName: 'x.pdf', fileBackend: 'supabase' }), 'supabase', 'locate bucket');
assert.strictEqual(locate({ storedName: 'x.pdf', fileBackend: 'cloudinary' }), 'cloudinary', 'locate cloud');
assert.strictEqual(locate({ storedName: 'x.pdf', fileData: 'eA==' }), 'db', 'locate embedded');
assert.strictEqual((await saveFile(tName, tBytes, 'application/pdf')).backend, 'local', 're-save for locate');
assert.strictEqual(locate({ storedName: tName }), 'local', 'locate disk');
await deleteFile(tName, null);
assert.strictEqual(locate({ storedName: tName }), 'missing', 'locate missing');
console.log('[PASS] storage.test.mjs — local fallback + tiers OK');

/* ---------- 2. supabase branch (mocked fetch) ---------- */
process.env.SUPABASE_URL = 'https://xyzcompany.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key-123';
assert.strictEqual(storageBackend(), 'supabase', 'backend switches on env');

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
  if ((opts.method || 'GET') === 'DELETE') return { ok: true };
  if ((opts.method || 'GET') === 'POST') return { ok: true };
  return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
};

const up = await saveFile('abc_report.pdf', Buffer.from('x'), 'application/pdf');
assert.ok(up && up.backend === 'supabase', 'mock upload');
assert.ok(calls[0].url === 'https://xyzcompany.supabase.co/storage/v1/object/reports/abc_report.pdf', 'upload URL, got ' + calls[0].url);
assert.strictEqual(calls[0].method, 'POST', 'upload method');
assert.strictEqual(calls[0].headers.Authorization, 'Bearer service-key-123', 'auth header');
assert.strictEqual(calls[0].headers['x-upsert'], 'true', 'upsert header');

const dl = await readFile('abc_report.pdf');
assert.ok(dl && dl.backend === 'supabase' && dl.buffer.length === 3, 'mock download');

await deleteFile('abc_report.pdf', null);
const del = calls[calls.length - 1];
assert.strictEqual(del.method, 'DELETE', 'delete method');
assert.ok(JSON.parse(String(del.body)).prefixes.includes('abc_report.pdf'), 'delete prefixes');

// upload failure -> null (caller keeps storedName null, same as before)
globalThis.fetch = async () => ({ ok: false, status: 400 });
assert.strictEqual(await saveFile('fail.pdf', Buffer.from('x'), 'application/pdf'), null, 'failed upload -> null');
// download failure falls back to disk, then null
assert.strictEqual(await readFile('definitely-not-here.pdf', null), null, 'failed download -> null');
// network throw -> null, never throws
globalThis.fetch = async () => { throw new Error('boom'); };
assert.strictEqual(await saveFile('throw.pdf', Buffer.from('x'), 'application/pdf'), null, 'network throw -> null');

console.log('[PASS] storage.test.mjs — supabase branch (mocked) OK');

/* ---------- 3. cloudinary branch (mocked fetch) ---------- */
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = 'key-123';
process.env.CLOUDINARY_API_SECRET = 'secret-abc';
assert.strictEqual(storageBackend(), 'cloudinary', 'backend prefers cloudinary when supabase absent');
assert.strictEqual(cloudPublicId('ab12_my report.pdf'), 'healthsphere/ab12_my_report.pdf', 'public id sanitized');

const ccalls = [];
globalThis.fetch = async (url, opts = {}) => {
  ccalls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
  if (String(url).includes('/auto/upload')) {
    return { ok: true, json: async () => ({ public_id: 'healthsphere/ab12_my_report.pdf', resource_type: 'image', secure_url: 'https://res.cloudinary.com/demo-cloud/image/upload/healthsphere/ab12_my_report.pdf' }) };
  }
  if (String(url).includes('/destroy')) return { ok: true, json: async () => ({ result: 'ok' }) };
  return { ok: true, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer };
};

const cup = await saveFile('ab12_my report.pdf', Buffer.from('pdf-bytes'), 'application/pdf');
assert.ok(cup && cup.backend === 'cloudinary', 'mock cloud upload');
assert.strictEqual(cup.publicId, 'healthsphere/ab12_my_report.pdf', 'public id returned');
assert.strictEqual(cup.resourceType, 'image', 'resource type returned');
const upCall = ccalls[0];
assert.ok(upCall.url === 'https://api.cloudinary.com/v1_1/demo-cloud/auto/upload', 'upload endpoint, got ' + upCall.url);
const upBody = String(upCall.body);
assert.ok(upBody.includes('name="api_key"') && upBody.includes('key-123'), 'api key in multipart');
assert.ok(upBody.includes('name="signature"') && /name="signature"\r\n\r\n[0-9a-f]{40}/.test(upBody), 'sha1 signature in multipart');
assert.ok(upBody.includes('name="timestamp"'), 'timestamp in multipart');
assert.ok(upBody.includes('pdf-bytes'), 'file bytes in multipart');

const cdl = await readFile('ab12_my report.pdf', { storedName: 'ab12_my report.pdf', fileBackend: 'cloudinary', cloudPublicId: 'healthsphere/ab12_my_report.pdf', fileResourceType: 'image' });
assert.ok(cdl && cdl.backend === 'cloudinary' && cdl.buffer.length === 3, 'mock cloud download');
assert.ok(ccalls[1].url === 'https://res.cloudinary.com/demo-cloud/image/upload/healthsphere/ab12_my_report.pdf', 'delivery URL, got ' + ccalls[1].url);

await deleteFile('ab12_my report.pdf', { storedName: 'ab12_my report.pdf', cloudPublicId: 'healthsphere/ab12_my_report.pdf', fileResourceType: 'image' });
const cdel = ccalls[ccalls.length - 1];
assert.ok(cdel.url === 'https://api.cloudinary.com/v1_1/demo-cloud/image/destroy', 'destroy endpoint, got ' + cdel.url);
const delBody = JSON.parse(String(cdel.body));
assert.strictEqual(delBody.public_id, 'healthsphere/ab12_my_report.pdf', 'destroy public id');
assert.ok(/^[0-9a-f]{40}$/.test(delBody.signature), 'destroy signature');

// supabase still wins when both configured
process.env.SUPABASE_URL = 'https://xyzcompany.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key-123';
assert.strictEqual(storageBackend(), 'supabase', 'supabase takes priority');

restore();
console.log('[PASS] storage.test.mjs — cloudinary branch (mocked) OK');
console.log('[PASS] storage.test.mjs — all storage tests OK');
