/* HealthSphere Research Hub — article schema, evidence categories and the
   publication state machine. Validation lives here so every API route and
   pipeline stage enforces the same contract. */

import { uid } from '../util.js';

/* Publication states (spec §9). Transitions are enforced by transitionState(). */
export const STATES = {
  DISCOVERED: 'discovered',
  INGESTED: 'ingested',
  PROCESSING: 'processing',
  PENDING_REVIEW: 'pending_review',            // high-risk content held for a human
  SUMMARY_PENDING_REVIEW: 'summary_pending_review', // AI summary generated, awaiting auto/manual publish
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  RETRACTED: 'retracted',
  CORRECTED: 'corrected',
  ARCHIVED: 'archived'
};

const TRANSITIONS = {
  discovered: ['ingested'],
  ingested: ['processing'],
  processing: ['pending_review', 'summary_pending_review'],
  pending_review: ['published', 'rejected'],
  summary_pending_review: ['published', 'rejected'],
  published: ['corrected', 'retracted', 'archived'],
  corrected: ['published', 'retracted', 'archived'],
  rejected: ['archived'],
  retracted: ['archived'],
  archived: []
};

export function transitionState(article, next, ev = {}) {
  const cur = article.status;
  if (!TRANSITIONS[cur] || !TRANSITIONS[cur].includes(next)) {
    throw new Error(`Invalid publication transition: ${cur} → ${next}`);
  }
  article.status = next;
  article.history = article.history || [];
  article.history.push({ from: cur, to: next, by: ev.by || 'system', reason: (ev.reason || '').slice(0, 400), ts: new Date().toISOString() });
  return article;
}

/* Evidence categories (spec §D). Not a rigid hierarchy — they describe the
   kind of evidence, to be read alongside study quality and applicability. */
export const EVIDENCE = {
  ESTABLISHED_GUIDANCE: 'established_guidance',     // official clinical guidance
  SYSTEMATIC_REVIEW: 'systematic_review',           // systematic reviews & meta-analyses
  RCT: 'rct',                                       // randomized controlled trial
  OBSERVATIONAL: 'observational',                   // cohort/case-control/etc.
  PRECLINICAL: 'preclinical',                       // laboratory or animal research
  PREPRINT: 'preprint',                             // not yet peer reviewed
  EXPERIMENTAL: 'experimental',                     // investigational therapy / early trial
  UNSUPPORTED: 'unsupported'                        // contradicted or no reliable basis
};

const TRIAL_PHASE_RE = /phase\s*(i{1,3}|iv|1|2|3|4)/i;
const RCT_RE = /\b(randomi[sz]ed|double[- ]?blind|placebo[- ]?controlled|rct)\b/i;
const REVIEW_RE = /\b(systematic review|meta[- ]?analysis|cochrane|pooled analysis|literature review)\b/i;
const PREPRINT_SERVER = /\b(medrxiv|biorxiv|ssrn|preprint|preprints?)\b/i;
const PRECLINICAL_RE = /\b(in vitro|in vivo|mouse model|mice model|murine|animal model|cell culture|laboratory study)\b/i;
const GUIDANCE_RE = /\b(guideline|guidance|recommendation|protocol|standard of care|who recommends|cdc recommends|icmr|ministery of health|mohfw)\b/i;

/** Best-effort evidence classification from metadata. Deterministic, explainable. */
export function classifyEvidence(a) {
  const hay = [a.title, a.abstract, a.studyType, a.publicationType, a.journal, a.publisher]
    .filter(Boolean).join(' ').toLowerCase();
  if (a.articleType === 'guidance' || GUIDANCE_RE.test(hay)) return EVIDENCE.ESTABLISHED_GUIDANCE;
  if (a.articleType === 'trial') {
    const phase = hay.match(TRIAL_PHASE_RE);
    return phase ? EVIDENCE.EXPERIMENTAL : EVIDENCE.RCT;
  }
  if (a.preprint || PREPRINT_SERVER.test(hay)) return EVIDENCE.PREPRINT;
  if (REVIEW_RE.test(hay)) return EVIDENCE.SYSTEMATIC_REVIEW;
  if (RCT_RE.test(hay)) return EVIDENCE.RCT;
  if (PRECLINICAL_RE.test(hay)) return EVIDENCE.PRECLINICAL;
  if (a.studyType && /cohort|case[- ]control|cross[- ]sectional|case (report|series)/i.test(a.studyType)) return EVIDENCE.OBSERVATIONAL;
  return EVIDENCE.OBSERVATIONAL; // default for peer-reviewed primary literature
}

/** Content flags that force human review before publication (spec §9). */
export function needsHumanReview(a) {
  const hay = [a.title, a.abstract].filter(Boolean).join(' ').toLowerCase();
  const flags = [];
  if (/\b(cure|cures|curative|breakthrough (cure|treatment)|miracle)\b/.test(hay)) flags.push('possible-cure-claim');
  if (/\b(outbreak|epidemic|pandemic|emergency|spread(ing)?\b|cluster of cases)\b/.test(hay)) flags.push('outbreak-warning');
  if (/\b(stop|quit|discontinue|wean off)\s+(taking\s+|using\s+)?(your\s+|the\s+|all\s+)?(medication|medicine|meds|treatment|vaccine|vaccination|drugs?|insulin|statins?|pills?)\b|\bdo not (take|vaccinate|get vaccinated)\b|\bvaccines? (cause|are (dangerous|unsafe|harmful))\b/.test(hay)) flags.push('treatment-interference');
  if (/\b(experimental|investigational|unapproved|compassionate use)\b/.test(hay) && /\b(treatment|therapy|drug)\b/.test(hay)) flags.push('investigational-therapy');
  if (a.preprint) flags.push('preprint');
  return flags;
}

/** Build a normalized article record from connector fields (pre-validation). */
export function newArticle(fields) {
  return {
    id: fields.id || uid('art'),
    sourceId: fields.sourceId,
    externalId: fields.externalId || null,
    title: String(fields.title || '').slice(0, 500),
    abstract: String(fields.abstract || '').slice(0, 20000),
    authors: Array.isArray(fields.authors) ? fields.authors.map(s => String(s).slice(0, 200)).slice(0, 50) : [],
    publisher: fields.publisher || null,       // organization or journal
    journal: fields.journal || null,
    url: fields.url || null,
    doi: fields.doi || null,
    pmid: fields.pmid || null,
    publishedAt: fields.publishedAt || null,   // source publication time (never retrieval time)
    modifiedAt: fields.modifiedAt || null,     // source-reported modification time
    retrievedAt: new Date().toISOString(),     // ingestion time (set at insert)
    articleType: fields.articleType || 'paper', // paper | trial | guidance | alert
    studyType: fields.studyType || null,
    topics: Array.isArray(fields.topics) ? fields.topics.slice(0, 10) : [],
    language: fields.language || 'en',
    openAccess: !!fields.openAccess,
    preprint: !!fields.preprint,
    status: 'discovered',
    history: [],
    version: 1                               // bumped on content corrections
  };
}

/** Validate an article shape; throws with a readable message. */
export function validateArticle(a) {
  if (!a || typeof a !== 'object') throw new Error('Article must be an object.');
  if (!a.title || !String(a.title).trim()) throw new Error('Article title is required.');
  if (!a.url && !a.doi && !a.pmid && !a.externalId) throw new Error('Article needs an external identifier (url, doi, pmid or externalId).');
  if (a.publishedAt && Number.isNaN(Date.parse(a.publishedAt))) throw new Error('publishedAt must be a valid date.');
  if (a.topics && !Array.isArray(a.topics)) throw new Error('topics must be an array.');
}

/** API-facing view — never exposes internal processing fields. */
export function publicArticle(a) {
  return {
    id: a.id, sourceId: a.sourceId, externalId: a.externalId, title: a.title,
    abstract: a.abstract, authors: a.authors, publisher: a.publisher, journal: a.journal,
    url: a.url, doi: a.doi, pmid: a.pmid, publishedAt: a.publishedAt, modifiedAt: a.modifiedAt,
    retrievedAt: a.retrievedAt, articleType: a.articleType, studyType: a.studyType,
    topics: a.topics, language: a.language, openAccess: a.openAccess, preprint: a.preprint,
    status: a.status, evidence: a.evidence, highRisk: Array.isArray(a.highRiskFlags) && a.highRiskFlags.length > 0 ? a.highRiskFlags : undefined,
    summary: a.summaryRef || null
  };
}
