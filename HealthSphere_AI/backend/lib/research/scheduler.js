/* HealthSphere Research Hub — background scheduler.
   The project has no Celery/Redis; this module provides the same guarantees
   with the existing runtime: per-source interval timers, a simple in-flight
   mutex per source, graceful shutdown, and per-source sync state on the store
   so restarts resume without duplicating work. Sync runs AFTER ingest to
   classify + flag high-risk content into the review queue. */

import { listSources, upsertSource, addSyncLog, getArticle, transitionArticle } from './store.js';
import { syncSource } from './connectors.js';
import { getOrCreateSummary } from './summarize.js';
import { STATES } from './schema.js';
import { insertAlert } from './store.js';

const timers = new Map();   // sourceId -> interval handle
const running = new Set();  // in-flight source ids

const DEFAULT_INTERVAL_MIN = 5;
const moduleEnabled = () => process.env.RESEARCH_ENABLED !== 'false'; // on by default; opt-out only

export function startResearchScheduler() {
  if (!moduleEnabled()) {
    console.log('[research] scheduler disabled via RESEARCH_ENABLED=false');
    return;
  }
  scheduleAll();
  console.log('[research] scheduler started');
}

export function stopResearchScheduler() {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
}

function scheduleAll() {
  for (const src of listSources()) {
    if (!src.enabled) { clearTimer(src.id); continue; }
    scheduleSource(src);
  }
}

function scheduleSource(src) {
  clearTimer(src.id);
  const intervalMs = Math.max(1, Number(src.intervalMin) || DEFAULT_INTERVAL_MIN) * 60 * 1000;
  timers.set(src.id, setInterval(() => { void runSync(src.id); }, intervalMs));
  void runSync(src.id); // initial sync on boot (non-blocking)
}

function clearTimer(id) {
  const t = timers.get(id);
  if (t) { clearInterval(t); timers.delete(id); }
}

/** Public: re-schedule after an admin enables/disables/changes a source. */
export function rescheduleSource(sourceId) {
  const src = listSources().find(s => s.id === sourceId);
  if (src && src.enabled) scheduleSource(src); else clearTimer(sourceId);
}

async function runSync(sourceId) {
  if (running.has(sourceId)) return; // mutex: never overlap syncs
  running.add(sourceId);
  try {
    const result = await syncSource(sourceId);
    await postProcess(sourceId);
  } catch (e) {
    // syncSource never throws (it logs); belt-and-braces:
    addSyncLog({ sourceId, ok: false, note: `scheduler error: ${e.message.slice(0, 200)}` });
  } finally {
    running.delete(sourceId);
  }
}

/** After ingest: classify → flag high-risk → auto-publish safe content →
    queue AI summaries. Official alerts are recorded for the Disease Watch. */
async function postProcess(sourceId) {
  const { listArticles } = await import('./store.js');
  const pending = listArticles()
    .filter(x => x.sourceId === sourceId && x.status === STATES.DISCOVERED)
    .map(x => x.id);
  for (const id of pending) {
    try {
      const fresh = getArticle(id);
      if (!fresh || fresh.status !== STATES.DISCOVERED) continue; // already handled
      transitionArticle(id, STATES.INGESTED, { by: 'pipeline' });
      const cur = transitionArticle(id, STATES.PROCESSING, { by: 'pipeline' });
      if (cur.highRiskFlags && cur.highRiskFlags.length) {
        transitionArticle(id, STATES.PENDING_REVIEW, { by: 'pipeline', reason: `auto-flag: ${cur.highRiskFlags.join(', ')}` });
        if (cur.articleType === 'alert') recordAlert(cur);
      } else {
        transitionArticle(id, STATES.SUMMARY_PENDING_REVIEW, { by: 'pipeline' });
        try { await getOrCreateSummary(id); } catch { /* AI offline is non-fatal */ }
        transitionArticle(id, STATES.PUBLISHED, { by: 'pipeline', reason: 'auto-published: low-risk, schema-valid' });
      }
    } catch (e) {
      console.error('[research] post-process failed for', id, e.message);
    }
  }
}

function recordAlert(article) {
  // Only official-tier sources may populate the emergency watch.
  const src = listSources().find(s => s.id === article.sourceId);
  if (!src || src.trustTier !== 'official') return;
  insertAlert({
    id: `alert_${article.id}`,
    sourceId: article.sourceId,
    externalId: article.externalId,
    title: article.title,
    announcedAt: article.publishedAt,
    retrievedAt: article.retrievedAt,
    url: article.url,
    reason: 'official-outbreak-news'
  });
}
