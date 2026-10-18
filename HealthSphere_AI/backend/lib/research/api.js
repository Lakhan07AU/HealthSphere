/* HealthSphere Research Hub — API routes.
   Follows the existing api.js conventions: route() registry, ok/bad helpers,
   auth via p.user, admin via adminOnly(). All timestamps UTC ISO. */

import { isAdmin, audit } from '../auth.js';
import { uid } from '../util.js';
import {
  listArticles, getArticle, getSource, listSources, upsertSource, dedupKey,
  listTopics, getPrefs, savePrefs, getSaved, setSaved, addReviewEvent,
  listReviewEvents, listSyncLogs, insertAlert, listAlerts, getSummary, putSummary,
  transitionArticle
} from './store.js';
import { publicArticle, STATES, validateArticle } from './schema.js';
import { normalizeArticle, upsertArticle } from './normalize.js';
import { getOrCreateSummary } from './summarize.js';
import { syncSource, ensureSourceRegistry, CONNECTORS, DEFAULT_SOURCES } from './connectors.js';
import { rescheduleSource } from './scheduler.js';

export const researchRoutes = [];
const route = (method, pattern, handler, opts = {}) => researchRoutes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const adminOnly = (res, p) => {
  if (!isAdmin(p.user)) { send(res, 403, { error: 'Admin access required.' }); return false; }
  return true;
};
const VALID_SORTS = { publishedAt: 1, retrievedAt: 1, title: 1 };
const queryOf = req => { try { return Object.fromEntries(new URL(req.url, 'http://x').searchParams); } catch { return {}; } };

/* ---------------- browsing ---------------- */
route('GET', /^\/api\/research\/articles$/, (req, res, p) => {
  const { q, topic, evidence, sourceId, status, articleType, openAccess, lang, sort = 'publishedAt', order = 'desc', page = '1', pageSize = '15' } = queryOf(req);
  const pg = Math.max(1, Math.min(200, parseInt(page) || 1));
  const ps = Math.min(50, Math.max(1, parseInt(pageSize) || 15));
  let rows = listArticles();
  if (status) rows = rows.filter(a => a.status === status);
  if (sourceId) rows = rows.filter(a => a.sourceId === sourceId);
  if (articleType) rows = rows.filter(a => a.articleType === articleType);
  if (openAccess === 'true') rows = rows.filter(a => a.openAccess);
  if (lang) rows = rows.filter(a => a.language === lang);
  if (topic) rows = rows.filter(a => (a.topics || []).includes(topic));
  if (evidence) rows = rows.filter(a => a.evidence === evidence);
  if (q) {
    const hay = q.toLowerCase();
    rows = rows.filter(a => (a.title || '').toLowerCase().includes(hay) || (a.abstract || '').toLowerCase().includes(hay) || (a.topics || []).some(t => t.toLowerCase().includes(hay)));
  }
  const sortKey = VALID_SORTS[sort] ? sort : 'publishedAt';
  rows.sort((a, b) => {
    const av = a[sortKey] || '', bv = b[sortKey] || '';
    return (av < bv ? -1 : av > bv ? 1 : 0) * (order === 'asc' ? 1 : -1);
  });
  const total = rows.length;
  const items = rows.slice((pg - 1) * ps, pg * ps).map(publicArticle);
  ok(res, { items, total, page: pg, pageSize: ps });
});

route('GET', /^\/api\/research\/articles\/([\w-]+)$/, (req, res, p) => {
  const a = getArticle(p.params[0]);
  if (!a) return bad(res, new Error('Article not found.'), 404);
  ok(res, publicArticle(a));
});

route('GET', /^\/api\/research\/articles\/([\w-]+)\/summary$/, async (req, res, p) => {
  const a = getArticle(p.params[0]);
  if (!a) return bad(res, new Error('Article not found.'), 404);
  try {
    const rec = await getOrCreateSummary(a.id);
    ok(res, rec);
  } catch (e) { bad(res, e, 502); }
});

route('GET', /^\/api\/research\/diseases$/, (req, res) => {
  const alerts = listAlerts();
  const diseaseRows = listArticles()
    .filter(a => a.articleType === 'alert' || (a.topics || []).some(t => ['Infectious diseases', 'Public health'].includes(t)))
    .slice(0, 50);
  ok(res, {
    watchlist: diseaseRows.map(publicArticle),
    officialAlerts: alerts.slice(0, 30),
    topics: listTopics().map(t => t.name)
  });
});

route('GET', /^\/api\/research\/topics$/, (req, res) => {
  ok(res, { topics: listTopics().map(t => t.name) });
});

route('GET', /^\/api\/research\/search$/, (req, res) => {
  const { q = '', topic = '', evidence = '', page = '1', pageSize = '15' } = queryOf(req);
  const pg = Math.max(1, parseInt(page) || 1);
  const ps = Math.min(50, Math.max(1, parseInt(pageSize) || 15));
  let rows = listArticles();
  if (q) rows = rows.filter(a => (a.title || '').toLowerCase().includes(q.toLowerCase()) || (a.abstract || '').toLowerCase().includes(q.toLowerCase()));
  if (topic) rows = rows.filter(a => (a.topics || []).includes(topic));
  if (evidence) rows = rows.filter(a => a.evidence === evidence);
  rows.sort((a, b) => String(b.publishedAt || '') > String(a.publishedAt || '') ? 1 : -1);
  ok(res, { items: rows.slice((pg - 1) * ps, pg * ps).map(publicArticle), total: rows.length, page: pg, pageSize: ps });
});

/* ---------------- user preferences ---------------- */
const INTEREST_OPTIONS = ['Diabetes', 'Cardiovascular health', 'Cancer research', 'Infectious diseases', 'Vaccines', 'Nutrition', 'Preventive medicine', 'Neurology', 'Public health', 'Mental wellness'];

route('GET', /^\/api\/research\/preferences$/, (req, res, p) => {
  ok(res, getPrefs(p.user.id));
});

route('PUT', /^\/api\/research\/preferences$/, (req, res, p) => {
  const b = p.body || {};
  const interests = (Array.isArray(b.interests) ? b.interests : []).filter(i => INTEREST_OPTIONS.includes(i)).slice(0, 20);
  const notify = { digest: !!b.notify?.digest, alerts: !!b.notify?.alerts };
  savePrefs(p.user.id, { interests, notify });
  audit(p.user.id, 'research_prefs_updated', interests.join(','));
  ok(res, getPrefs(p.user.id));
});

/* ---------------- saved articles ---------------- */
route('GET', /^\/api\/research\/saved$/, (req, res, p) => {
  const rows = getSaved(p.user.id).map(r => ({ ...r, article: publicArticle(getArticle(r.articleId) || {}) }));
  ok(res, { items: rows.filter(r => r.article && r.article.id) });
});

route('POST', /^\/api\/research\/saved\/([\w-]+)$/, (req, res, p) => {
  const a = getArticle(p.params[0]);
  if (!a) return bad(res, new Error('Article not found.'), 404);
  const rows = getSaved(p.user.id);
  if (!rows.some(r => r.articleId === a.id)) {
    rows.push({ articleId: a.id, savedAt: new Date().toISOString(), list: 'default', read: false });
    setSaved(p.user.id, rows);
    audit(p.user.id, 'research_article_saved', a.id);
  }
  ok(res, { saved: true });
});

route('DELETE', /^\/api\/research\/saved\/([\w-]+)$/, (req, res, p) => {
  const rows = getSaved(p.user.id).filter(r => r.articleId !== p.params[0]);
  setSaved(p.user.id, rows);
  audit(p.user.id, 'research_article_unsaved', p.params[0]);
  ok(res, { saved: false });
});

/* ---------------- admin: sources ---------------- */
route('GET', /^\/api\/admin\/research\/sources$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, { sources: listSources(), connectorTypes: Object.keys(CONNECTORS) });
});

route('POST', /^\/api\/admin\/research\/sources$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const b = p.body || {};
  if (!b.name || !b.baseUrl) return bad(res, new Error('name and baseUrl are required.'));
  const src = upsertSource({
    id: b.id || uid('src'),
    name: b.name, baseUrl: b.baseUrl, category: b.category || 'custom',
    connectorType: b.connectorType || 'rest', trustTier: b.trustTier || 'review',
    enabled: !!b.enabled, intervalMin: Math.max(5, Number(b.intervalMin) || 15),
    rateLimitMs: Math.max(0, Number(b.rateLimitMs) || 500),
    maxPerSync: Math.max(1, Number(b.maxPerSync) || 50),
    license: b.license || '', note: b.note || ''
  });
  audit(p.user.id, 'research_source_created', src.id);
  ok(res, { source: src });
});

route('PATCH', /^\/api\/admin\/research\/sources\/([\w-]+)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const src = getSource(p.params[0]);
  if (!src) return bad(res, new Error('Source not found.'), 404);
  const b = p.body || {};
  upsertSource({ ...src, ...b, id: src.id });
  if (process.env.RESEARCH_ENABLED !== 'false') rescheduleSource(src.id);
  audit(p.user.id, 'research_source_updated', src.id);
  ok(res, { source: getSource(src.id) });
});

route('POST', /^\/api\/admin\/research\/sources\/([\w-]+)\/sync$/, async (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const src = getSource(p.params[0]);
  if (!src) return bad(res, new Error('Source not found.'), 404);
  const result = await syncSource(src.id, { query: p.body?.query });
  audit(p.user.id, 'research_sync_triggered', `${src.id}:${result.ok ? 'ok' : 'fail'}`);
  ok(res, result);
});

/* ---------------- admin: review workflow ---------------- */
route('GET', /^\/api\/admin\/research\/reviews$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const { status } = queryOf(req);
  const rows = status
    ? listArticles().filter(a => a.status === status)
    : listArticles().filter(a => a.status === STATES.PENDING_REVIEW || a.status === STATES.SUMMARY_PENDING_REVIEW);
  ok(res, { items: rows.map(a => publicArticle(a)), events: listReviewEvents(20) });
});

route('POST', /^\/api\/admin\/research\/articles\/([\w-]+)\/(approve|reject|correct|retract|archive)$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const a = getArticle(p.params[0]);
  if (!a) return bad(res, new Error('Article not found.'), 404);
  const action = p.params[1];
  const target = { approve: STATES.PUBLISHED, reject: STATES.REJECTED, correct: STATES.CORRECTED, retract: STATES.RETRACTED, archive: STATES.ARCHIVED }[action];
  try {
    const reason = String(p.body?.reason || '').slice(0, 400);
    transitionArticle(a.id, target, { by: p.user.email, reason });
    if (action === 'correct' && p.body?.summary) {
      putSummary(a.id, { ...(getSummary(a.id) || {}), summary: p.body.summary, editedBy: p.user.email, editedAt: new Date().toISOString() });
    }
    addReviewEvent({ articleId: a.id, action, by: p.user.email, reason });
    audit(p.user.id, `research_article_${action}`, a.id);
    ok(res, { article: publicArticle(getArticle(a.id)) });
  } catch (e) { bad(res, e); }
});

route('POST', /^\/api\/admin\/research\/articles$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  const b = p.body || {};
  try {
    const normalized = normalizeArticle(b, b.sourceId || 'manual');
    const { article, created } = upsertArticle(normalized);
    audit(p.user.id, 'research_article_manual', article.id);
    ok(res, { article: publicArticle(article), created });
  } catch (e) { bad(res, e); }
});

route('GET', /^\/api\/admin\/research\/sync-logs$/, (req, res, p) => {
  if (!adminOnly(res, p)) return;
  ok(res, { logs: listSyncLogs(100) });
});

/* ---------------- bootstrap registry on module load ---------------- */
ensureSourceRegistry();
