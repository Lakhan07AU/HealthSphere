/* HealthSphere Research Hub — normalization, deduplication and topic
   classification. Every connector record becomes the same internal article
   shape before it touches the store. */

import { newArticle, validateArticle, classifyEvidence, needsHumanReview, STATES } from './schema.js';
import { dedupKey, contentHash, findArticleByDedup, insertArticle, updateArticle, listArticles } from './store.js';

/* Curated educational topics (spec §F). Keyword rules classify free text. */
export const TOPIC_CATALOG = [
  { name: 'Diabetes', keywords: ['diabetes', 'glucose', 'insulin', 'hba1c', 'glycemic', 'diabetic'] },
  { name: 'Cardiovascular health', keywords: ['cardiovascular', 'heart', 'cardiac', 'hypertension', 'blood pressure', 'stroke', 'coronary', 'cholesterol', 'myocardial'] },
  { name: 'Cancer research', keywords: ['cancer', 'carcinoma', 'tumor', 'tumour', 'oncolog', 'chemotherapy', 'metasta', 'lymphoma', 'leukemia'] },
  { name: 'Infectious diseases', keywords: ['infectious', 'infection', 'bacterial', 'viral', 'sepsis', 'pneumonia', 'tuberculosis', 'malaria', 'hiv'] },
  { name: 'Vaccines', keywords: ['vaccine', 'vaccination', 'immuniz', 'immunis', 'mrna vaccine', 'booster'] },
  { name: 'Nutrition', keywords: ['nutrition', 'diet', 'nutrient', 'vitamin', 'obesity', 'malnutrition', 'micronutrient'] },
  { name: 'Preventive medicine', keywords: ['preventive', 'prevention', 'screening', 'early detection', 'prophylax', 'risk reduction'] },
  { name: 'Neurology', keywords: ['neuro', 'alzheimer', 'parkinson', 'dementia', 'epilepsy', 'multiple sclerosis', 'brain'] },
  { name: 'Public health', keywords: ['public health', 'epidemiol', 'population health', 'health policy', 'surveillance', 'outbreak response', 'who'] },
  { name: 'Mental wellness', keywords: ['mental health', 'depression', 'anxiety', 'psychiatr', 'psycholog', 'suicide', 'well-being'] }
];

/** Normalize one raw connector record → validated internal article. */
export function normalizeArticle(raw, sourceId) {
  const a = newArticle({ ...raw, sourceId });
  validateArticle(a);
  a.topics = classifyTopics(`${a.title || ''}\n${a.abstract || ''}`);
  a.evidence = classifyEvidence(a);
  a.highRiskFlags = needsHumanReview(a);
  a.status = STATES.DISCOVERED;
  return a;
}

/** Keyword-based topic classification. Deterministic, explainable, offline. */
export function classifyTopics(text) {
  const hay = String(text || '').toLowerCase();
  return TOPIC_CATALOG.filter(t => t.keywords.some(k => hay.includes(k))).map(t => t.name);
}

/** Title similarity for probable duplicates (spec §8). Token overlap ≥ 0.8. */
export function titlesSimilar(t1, t2) {
  const tok = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
  const a = tok(t1), b = tok(t2);
  if (!a.size || !b.size) return false;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size) >= 0.8;
}

/**
 * Idempotent upsert. Returns { article, created, duplicateOf }.
 * Dedup order: stable id key → title similarity (never merges unrelated
 * papers that merely share a disease — similarity is on titles, not topics).
 */
export function upsertArticle(normalized) {
  const key = dedupKey(normalized);
  const existing = findArticleByDedup(key);
  if (existing) return mergeExisting(existing, normalized);

  for (const other of listArticles()) {
    if (other.id === normalized.id || !titlesSimilar(other.title, normalized.title)) continue;
    // Enforce the 30-day window only when BOTH records carry a usable date;
    // when a date is missing, a near-identical title is still treated as the
    // same paper across sources rather than silently duplicated.
    const d1 = Date.parse(other.publishedAt || '');
    const d2 = Date.parse(normalized.publishedAt || '');
    const withinWindow = Number.isNaN(d1) || Number.isNaN(d2) || Math.abs(d1 - d2) < 30 * 86400000;
    if (withinWindow) return mergeExisting(other, normalized);
  }

  const article = insertArticle(normalized);
  return { article, created: true, duplicateOf: null };
}

function mergeExisting(existing, incoming) {
  // Keep the earliest source record; refresh mutable metadata; preserve review state.
  const updated = updateArticle(existing.id, {
    modifiedAt: incoming.modifiedAt || existing.modifiedAt,
    retrievedAt: new Date().toISOString(),
    abstract: (incoming.abstract || '').length > (existing.abstract || '').length ? incoming.abstract : existing.abstract,
    topics: Array.from(new Set([...(existing.topics || []), ...(incoming.topics || [])])).slice(0, 10),
    openAccess: existing.openAccess || incoming.openAccess,
    version: (existing.version || 1) + (incoming.publishedAt && incoming.publishedAt !== existing.publishedAt ? 1 : 0)
  });
  return { article: updated, created: false, duplicateOf: existing.id };
}
