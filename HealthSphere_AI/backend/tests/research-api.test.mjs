import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Fast, isolated boot: force db.js to skip postgres (unreachable port) and
   keep both the main and research stores in throwaway directories. */
const DIR = path.join(os.tmpdir(), `hs_research_api_${Date.now()}`);
process.env.RESEARCH_DATA_DIR = DIR;
process.env.HealthSphere_DATA_DIR = DIR;
process.env.PG_PORT = '1';              // immediate connection refusal -> JSON file mode
process.env.ADMIN_EMAILS = 'admin@local.test';
fs.mkdirSync(DIR, { recursive: true });

const { researchRoutes } = await import('../lib/research/api.js');
const { upsertArticle, normalizeArticle } = await import('../lib/research/normalize.js');
const { listArticles, listTopics, getPrefs } = await import('../lib/research/store.js');
const { STATES } = await import('../lib/research/schema.js');

const ADMIN = { id: 'u_admin', email: 'admin@local.test' };
const PATIENT = { id: 'u_patient', email: 'p@local.test' };

/* ---------- tiny route harness mirroring lib/api.js dispatch ---------- */
async function call(method, fullUrl, { body = null, user = PATIENT } = {}) {
  const url = new URL(fullUrl, 'http://x');
  for (const r of researchRoutes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(url.pathname);
    if (!m) continue;
    const res = { status: null, json: null, writeHead(s) { this.status = s; }, end(b) { this.json = JSON.parse(b); } };
    const req = { method, url: fullUrl, headers: {} };
    await r.handler(req, res, { params: m.slice(1), query: Object.fromEntries(url.searchParams), body, user, req });
    return res;
  }
  throw new Error(`No route for ${method} ${url.pathname}`);
}

/* ---------- seed a few articles through the real pipeline ---------- */
const mk = (ext, title, abstract, extra = {}) => upsertArticle(normalizeArticle({ externalId: ext, title, abstract, url: `https://example.org/${ext}`, ...extra }, 'europepmc')).article;
const aPublish = mk('API1', 'Diabetes glucose control trial', 'A randomized controlled trial of glucose lowering in diabetic adults with a long enough abstract for summarization.');
const aReview = mk('API2', 'New breakthrough cure for cancer spreads', 'A claim that a miracle cure exists and an outbreak is spreading rapidly across regions.');
const aCancer = mk('API3', 'Cancer research: new biomarker', 'An observational study of a cancer biomarker in a large cohort of patients.', { publishedAt: '2024-05-01' });
assert.strictEqual(getPrefs(ADMIN.id).interests.length, 0, 'prefs start empty for a new user');

/* ---------- topics seeded on module load ---------- */
let res = await call('GET', '/api/research/topics');
assert.strictEqual(res.status, 200, 'topics 200');
assert.strictEqual(res.json.topics.length, 10, 'ten topics returned');
assert.strictEqual(listTopics().length, 10, 'topics persisted to store');

/* ---------- article listing + filters ---------- */
res = await call('GET', '/api/research/articles?pageSize=2&page=1');
assert.strictEqual(res.status, 200, 'list 200');
assert.ok(res.json.total >= 3, 'list reports total');
assert.strictEqual(res.json.items.length, 2, 'pageSize honored');
assert.ok(res.json.pageSize <= 50, 'pageSize capped at 50');

res = await call('GET', '/api/research/articles?pageSize=100');
assert.strictEqual(res.json.pageSize, 50, 'pageSize never exceeds 50');

res = await call('GET', '/api/research/articles?q=cancer&pageSize=20');
assert.ok(res.json.items.every(a => /cancer/i.test(a.title + a.abstract)), 'q filter matches title/abstract');

res = await call('GET', '/api/research/articles?topic=Diabetes&pageSize=20');
assert.ok(res.json.items.every(a => (a.topics || []).includes('Diabetes')), 'topic filter applied');

/* ---------- detail + summary + save/unsave ---------- */
res = await call('GET', `/api/research/articles/${aPublish.id}`);
assert.strictEqual(res.json.id, aPublish.id, 'article detail returns the article directly');
assert.ok(!('highRiskFlags' in res.json), 'internal fields not leaked');

res = await call('GET', `/api/research/articles/${aPublish.id}/summary`);
assert.strictEqual(res.status, 200, 'summary 200');
assert.ok(res.json.summary && res.json.summary.simpleEnglish, 'summary wrapped in .summary');

res = await call('POST', `/api/research/saved/${aPublish.id}`);
assert.deepStrictEqual(res.json, { saved: true }, 'save returns saved:true');
res = await call('GET', '/api/research/saved');
assert.strictEqual(res.json.items.length, 1, 'one saved item');
assert.strictEqual(res.json.items[0].article.id, aPublish.id, 'saved item embeds article');
res = await call('DELETE', `/api/research/saved/${aPublish.id}`);
assert.deepStrictEqual(res.json, { saved: false }, 'unsave returns saved:false');
res = await call('GET', '/api/research/saved');
assert.strictEqual(res.json.items.length, 0, 'saved list empty after unsave');

res = await call('POST', '/api/research/saved/art_does_not_exist');
assert.strictEqual(res.status, 404, 'saving an unknown article 404s');

/* ---------- preferences ---------- */
res = await call('PUT', '/api/research/preferences', { body: { interests: ['Diabetes', 'Bogus topic', 'Vaccines'], notify: { digest: true, alerts: false } } });
assert.strictEqual(res.status, 200, 'prefs put 200');
assert.deepStrictEqual(res.json.interests, ['Diabetes', 'Vaccines'], 'unknown interests filtered out');
assert.strictEqual(res.json.notify.digest, true, 'digest preference saved');
res = await call('GET', '/api/research/preferences');
assert.deepStrictEqual(res.json.interests, ['Diabetes', 'Vaccines'], 'prefs persisted');

/* ---------- disease watch ---------- */
res = await call('GET', '/api/research/diseases');
assert.strictEqual(res.status, 200, 'diseases 200');
assert.ok(Array.isArray(res.json.watchlist) && Array.isArray(res.json.officialAlerts), 'watchlist + alerts arrays');

/* ---------- admin gating ---------- */
res = await call('GET', '/api/admin/research/sources', { user: PATIENT });
assert.strictEqual(res.status, 403, 'non-admin blocked from sources');
res = await call('GET', '/api/admin/research/reviews', { user: PATIENT });
assert.strictEqual(res.status, 403, 'non-admin blocked from reviews');

/* ---------- admin: sources + review workflow + manual entry ---------- */
res = await call('GET', '/api/admin/research/sources', { user: ADMIN });
assert.strictEqual(res.status, 200, 'admin reads sources');
assert.strictEqual(res.json.sources.length, 7, 'seven sources listed');
assert.ok(res.json.connectorTypes.includes('europepmc'), 'connector types exposed');

// approve the high-risk article that is still 'discovered' (held manually)
const held = listArticles().find(a => a.id === aReview.id);
const { transitionArticle } = await import('../lib/research/store.js');
transitionArticle(held.id, STATES.INGESTED);
transitionArticle(held.id, STATES.PROCESSING);
transitionArticle(held.id, STATES.PENDING_REVIEW);

res = await call('GET', '/api/admin/research/reviews', { user: ADMIN });
assert.ok(res.json.items.some(a => a.id === held.id), 'pending_review article appears in queue');

res = await call('POST', `/api/admin/research/articles/${held.id}/approve`, { user: ADMIN, body: { reason: 'reviewed by clinician' } });
assert.strictEqual(res.status, 200, 'approve 200');
assert.strictEqual(res.json.article.status, STATES.PUBLISHED, 'approved article is published');

res = await call('GET', '/api/admin/research/reviews', { user: ADMIN });
assert.ok(res.json.events.some(e => e.articleId === held.id && e.action === 'approve'), 'review event recorded');

res = await call('POST', '/api/admin/research/articles', { user: ADMIN, body: { title: 'Manually entered alert', abstract: 'Entered by an admin from an official bulletin.', url: 'https://cdc.gov/manual/1', sourceId: 'cdc', articleType: 'alert' } });
assert.strictEqual(res.status, 200, 'manual article created');
assert.strictEqual(res.json.created, true, 'manual article is new');

res = await call('POST', '/api/admin/research/articles', { user: ADMIN, body: { abstract: 'no title' } });
assert.strictEqual(res.status, 400, 'manual article without title rejected');

/* ---------- sync-logs ---------- */
res = await call('GET', '/api/admin/research/sync-logs', { user: ADMIN });
assert.strictEqual(res.status, 200, 'sync logs 200');
assert.ok(Array.isArray(res.json.logs), 'logs array returned');

console.log('[PASS] research-api.test.mjs — routes, auth gating, review workflow OK');
process.exit(0);
