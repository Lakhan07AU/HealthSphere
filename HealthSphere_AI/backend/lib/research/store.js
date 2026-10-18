/* HealthSphere Research Hub — persistence layer.
   Mirrors the conventions of lib/db.js: one JSON document, atomic
   write-tmp-then-rename, in-memory cache, persist() after every mutation.
   Stored separately from the main db.json so research volume never bloats
   health-record operations (and vice versa). */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { uid } from '../util.js';
import { transitionState } from './schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESEARCH_DATA_DIR = process.env.RESEARCH_DATA_DIR || path.join(ROOT, 'data', 'research');
fs.mkdirSync(RESEARCH_DATA_DIR, { recursive: true });
const FILE = path.join(RESEARCH_DATA_DIR, 'research.json');

export const SCHEMA_VERSION = 1;

function defaults() {
  return {
    version: SCHEMA_VERSION,
    sources: [],        // source registry (see connectors.js for shape)
    articles: [],       // normalized articles (see schema.js)
    summaries: {},      // articleId -> structured AI summary record
    alerts: [],         // high-priority official developments
    topics: [],         // curated educational topic catalog
    preferences: {},    // userId -> { interests: [], notify: {...} }
    saved: {},          // userId -> [{ articleId, savedAt, list, read }]
    reviewEvents: [],   // admin review audit trail
    syncLogs: []        // per-source sync outcomes
  };
}

let state = defaults();
try { state = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
catch { /* fresh store */ }

function persist() {
  const tmp = FILE + '.tmp';
  const data = JSON.stringify(state, null, 1);
  fs.writeFileSync(tmp, data);
  // Windows can transiently lock the destination (indexer/AV); retry the
  // atomic rename, then fall back to an in-place write rather than losing data.
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.renameSync(tmp, FILE); return; }
    catch (e) {
      if (attempt === 4 || (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES')) {
        fs.writeFileSync(FILE, data);
        try { fs.unlinkSync(tmp); } catch { /* noop */ }
        return;
      }
      const wait = Date.now() + 15;
      while (Date.now() < wait) { /* brief spin before retry */ }
    }
  }
}
process.on('exit', () => { try { persist(); } catch { /* noop */ } });

export function db() { return state; }
export { persist as persistResearch };
export { uid as researchUid };

/* ---------------- sources ---------------- */
export function listSources() { return state.sources; }
export function getSource(id) { return state.sources.find(s => s.id === id) || null; }
export function upsertSource(src) {
  const i = state.sources.findIndex(s => s.id === src.id);
  if (i >= 0) state.sources[i] = { ...state.sources[i], ...src };
  else state.sources.push(src);
  persist();
  return i >= 0 ? state.sources[i] : state.sources[state.sources.length - 1];
}

/* ---------------- articles ---------------- */
export function listArticles() { return state.articles; }
export function getArticle(id) { return state.articles.find(a => a.id === id) || null; }

/** Stable external identity: prefer DOI, then PMID, then source-scoped id,
 *  then normalized URL. Used for idempotent dedup across syncs. */
export function dedupKey(a) {
  const doi = String(a.doi || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const pmid = String(a.pmid || '').trim();
  if (pmid) return `pmid:${pmid}`;
  if (a.sourceId && a.externalId) return `ext:${a.sourceId}:${String(a.externalId).trim().toLowerCase()}`;
  if (a.url) return `url:${a.url.trim().toLowerCase().replace(/\/$/, '')}`;
  return `hash:${contentHash(a)}`;
}
export function contentHash(a) {
  const s = `${a.title || ''}|${a.abstract || ''}|${a.publishedAt || ''}|${a.url || ''}`;
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
}
export function findArticleByDedup(key) { return state.articles.find(a => dedupKey(a) === key) || null; }
export function insertArticle(a) {
  state.articles.push(a);
  if (state.articles.length > 5000) state.articles = state.articles.slice(-5000); // retention bound
  persist();
  return a;
}
export function updateArticle(id, patch) {
  const a = getArticle(id);
  if (!a) return null;
  Object.assign(a, patch, { updatedAt: new Date().toISOString() });
  persist();
  return a;
}

/** Validate + persist a publication-state change (history is written to disk). */
export function transitionArticle(id, next, ev = {}) {
  if (!id) throw new Error('Cannot transition an article without an id.');
  const a = getArticle(id);
  if (!a) return null;
  const updated = transitionState(a, next, ev);
  persist();
  return updated;
}

/* ---------------- summaries ---------------- */
export function getSummary(articleId) { return state.summaries[articleId] || null; }
export function putSummary(articleId, rec) {
  state.summaries[articleId] = { ...rec, updatedAt: new Date().toISOString() };
  persist();
}

/* ---------------- alerts ---------------- */
export function listAlerts() { return state.alerts; }
export function insertAlert(alert) {
  // idempotent: same source + external id or title+date
  const dup = state.alerts.some(x =>
    (alert.sourceId && x.sourceId === alert.sourceId && alert.externalId && x.externalId === alert.externalId) ||
    (x.title === alert.title && x.announcedAt === alert.announcedAt));
  if (dup) return null;
  state.alerts.push(alert);
  if (state.alerts.length > 1000) state.alerts = state.alerts.slice(-1000);
  persist();
  return alert;
}

/* ---------------- topics ---------------- */
export function listTopics() { return state.topics; }
export function replaceTopics(topics) { state.topics = topics; persist(); }
export function topicByName(name) { return state.topics.find(t => t.name === name) || null; }

/* ---------------- per-user data (preferences / saved) ---------------- */
export function getPrefs(userId) {
  if (!state.preferences[userId]) {
    state.preferences[userId] = { interests: [], notify: { digest: false, alerts: false }, updatedAt: new Date().toISOString() };
  }
  return state.preferences[userId];
}
export function savePrefs(userId, prefs) {
  state.preferences[userId] = { ...prefs, userId, updatedAt: new Date().toISOString() };
  persist();
}
export function getSaved(userId) { return state.saved[userId] || []; }
export function setSaved(userId, rows) { state.saved[userId] = rows; persist(); }

/* ---------------- review + sync audit ---------------- */
export function addReviewEvent(ev) {
  state.reviewEvents.push({ ...ev, ts: new Date().toISOString() });
  if (state.reviewEvents.length > 2000) state.reviewEvents = state.reviewEvents.slice(-2000);
  persist();
}
export function listReviewEvents(limit = 100) { return state.reviewEvents.slice(-limit).reverse(); }
export function addSyncLog(log) {
  state.syncLogs.push({ ...log, ts: new Date().toISOString() });
  if (state.syncLogs.length > 1000) state.syncLogs = state.syncLogs.slice(-1000);
  persist();
}
export function listSyncLogs(limit = 100) { return state.syncLogs.slice(-limit).reverse(); }
export function lastSync(sourceId) {
  const s = getSource(sourceId);
  return s ? { ok: s.lastSyncOk, at: s.lastSyncAt, attempt: s.lastSyncAttemptAt } : null;
}
