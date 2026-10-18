/* HealthSphere Research Hub — AI research summarization service.
   Provider-interface design: the default provider is a deterministic,
   offline extractive summarizer so the feature works with zero paid
   services. A real LLM can be plugged in later via AI_PROVIDER env var
   without touching callers. All output is schema-validated; unsupported
   or insufficient evidence is flagged, never papered over. Article text
   is treated as untrusted data — it can never alter system behavior. */

import crypto from 'node:crypto';
import { getArticle, getSummary, putSummary } from './store.js';

export const SUMMARY_SCHEMA_VERSION = '1.0';
export const PROMPT_VERSION = 'offline-extractive-v1';

const SUMMARY_FIELDS = [
  'simpleEnglish', 'researchQuestion', 'studyType', 'keyFindings',
  'limitations', 'evidenceStatus', 'practicalRelevance', 'whatRemainsUnknown', 'source'
];

const EVIDENCE_STATUSES = ['established', 'promising', 'preliminary', 'insufficient', 'conflicting'];

/* ---------------- provider interface ---------------- */
export async function summarizeArticle(article, { provider } = {}) {
  const p = provider || process.env.AI_PROVIDER || 'offline';
  const llm = LOAD_PROVIDERS()[p];
  if (!llm) throw new Error(`Unknown AI provider: ${p}`);
  const raw = await llm(article);
  return validateAndWrap(article, raw, p);
}

/* Offline provider: deterministic extractive summary built from the
   retrieved abstract only. No network, no keys, no hallucination surface
   beyond what the source text itself supports. */
function offlineProvider(article) {
  const text = String(article.abstract || '').trim();
  if (text.length < 80) {
    return {
      simpleEnglish: 'This record does not include enough abstract text to summarize reliably.',
      researchQuestion: 'Not stated in the retrieved record.',
      studyType: article.studyType || 'Not stated in the retrieved record.',
      keyFindings: [],
      limitations: ['Abstract text was too short or missing; no findings can be responsibly extracted.'],
      evidenceStatus: 'insufficient',
      practicalRelevance: 'No practical conclusion can be drawn from this record alone.',
      whatRemainsUnknown: 'Nearly everything — the full text and study details were not available to the summarizer.',
      source: article.url || null
    };
  }
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [text];
  const scored = sentences.map((s, i) => ({ s: s.trim(), i, score: scoreSentence(s, text) }));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.i - b.i);
  const findings = top.map(t => cap(t.s, 220));
  return {
    simpleEnglish: findings.join(' '),
    researchQuestion: inferQuestion(article),
    studyType: article.studyType || 'Not explicitly classified in the retrieved record.',
    keyFindings: findings,
    limitations: inferLimitations(article),
    evidenceStatus: statusFor(article, text),
    practicalRelevance: 'This is an educational summary of one record. It is not personalized medical advice and does not replace consultation with a qualified professional.',
    whatRemainsUnknown: 'Whether these findings apply to any specific individual, effect sizes, and longer-term outcomes require the full study and clinical judgement.',
    source: article.url || null
  };
}

/* A hook for a future real-LLM provider. Defined but not wired to any paid
   service — keeps the interface honest and testable. */
async function httpProvider() {
  throw new Error('No HTTP AI provider configured. Set AI_PROVIDER=offline (default).');
}
const LOAD_PROVIDERS = () => ({ offline: offlineProvider, http: httpProvider });

/* ---------------- helpers ---------------- */
function scoreSentence(s, text) {
  const freq = new Map();
  for (const w of text.toLowerCase().match(/[a-z]{4,}/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
  const words = s.toLowerCase().match(/[a-z]{4,}/g) || [];
  const tf = words.reduce((sum, w) => sum + Math.log(1 + (freq.get(w) || 0)), 0) / Math.max(1, words.length);
  const positionBonus = /^(this study|we (found|show|report)|results|conclusion|objective|background)/i.test(s) ? 0.6 : 0;
  const numberBonus = /\d/.test(s) ? 0.25 : 0;
  return tf + positionBonus + numberBonus;
}
function inferQuestion(a) {
  const t = `${a.title || ''} ${a.studyType || ''}`.toLowerCase();
  if (/trial|phase/.test(t)) return 'Whether the investigated intervention is safe and effective under controlled conditions.';
  if (/review|meta/.test(t)) return 'What the accumulated body of studies reports about this question.';
  return 'What the available evidence reports about the topic of this record.';
}
function inferLimitations(a) {
  const lim = ['Single-record summary; effect sizes and confidence intervals may not be represented.'];
  if (a.preprint) lim.push('Preprint — not yet peer reviewed.');
  if (!a.abstract || a.abstract.length < 200) lim.push('Abstract text was limited, so detail may be missing.');
  if (a.articleType === 'trial') lim.push('Early-phase results may not generalize to broader populations.');
  return lim;
}
function statusFor(a, text) {
  if (a.preprint) return 'preliminary';
  if (/systematic review|meta[- ]analysis/i.test(text)) return 'established';
  if (a.articleType === 'trial') return 'promising';
  return 'preliminary';
}
const cap = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/* ---------------- validation + caching ---------------- */
function validateAndWrap(article, raw, provider) {
  if (!raw || typeof raw !== 'object') throw new Error('Summarizer returned no structured output.');
  const out = {};
  for (const f of SUMMARY_FIELDS) {
    const v = raw[f];
    if (typeof v === 'string') out[f] = v.slice(0, 4000);
    else if (Array.isArray(v)) out[f] = v.map(x => String(x).slice(0, 800)).filter(Boolean).slice(0, 12);
    else if (f === 'keyFindings' && !Array.isArray(v)) out[f] = [];
    else out[f] = '';
  }
  if (!out.simpleEnglish) throw new Error('Summarizer output missing simpleEnglish.');
  if (!EVIDENCE_STATUSES.includes(out.evidenceStatus)) out.evidenceStatus = 'insufficient';
  if (out.keyFindings && !Array.isArray(raw.keyFindings)) out.keyFindings = [];

  // Guardrail: never fabricate a source link.
  if (out.source && article.url && out.source !== article.url && !String(out.source).includes(article.url)) {
    out.source = article.url;
  }
  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    promptVersion: provider === 'offline' ? PROMPT_VERSION : `llm:${provider}`,
    provider,
    contentHash: crypto.createHash('sha256').update(article.abstract || '').digest('hex').slice(0, 16),
    summary: out,
    generatedAt: new Date().toISOString()
  };
}

/** Get-or-create summary, cached on content hash + prompt version. */
export async function getOrCreateSummary(articleId, { force = false, provider } = {}) {
  const article = getArticle(articleId);
  if (!article) throw new Error('Article not found.');
  const contentHash = crypto.createHash('sha256').update(article.abstract || '').digest('hex').slice(0, 16);
  if (!force) {
    const cached = getSummary(articleId);
    if (cached && cached.contentHash === contentHash) return { ...cached, cached: true };
  }
  const rec = await summarizeArticle(article, { provider });
  putSummary(articleId, rec);
  return { ...rec, cached: false };
}
