import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Isolate the research store in a throwaway directory BEFORE importing. */
const DIR = path.join(os.tmpdir(), `hs_research_norm_${Date.now()}`);
process.env.RESEARCH_DATA_DIR = DIR;
fs.mkdirSync(DIR, { recursive: true });

const { normalizeArticle, upsertArticle, classifyTopics, titlesSimilar, TOPIC_CATALOG } = await import('../lib/research/normalize.js');
const { listArticles, dedupKey } = await import('../lib/research/store.js');
const { STATES } = await import('../lib/research/schema.js');

/* ---------- topic classification ---------- */
assert.strictEqual(TOPIC_CATALOG.length, 10, 'topic catalog has 10 curated topics');
assert.ok(classifyTopics('A study of diabetes and insulin resistance').includes('Diabetes'), 'diabetes classified');
assert.ok(classifyTopics('mRNA vaccine booster efficacy').includes('Vaccines'), 'vaccines classified');
assert.ok(classifyTopics('breast cancer chemotherapy outcomes').includes('Cancer research'), 'cancer classified');
assert.deepStrictEqual(classifyTopics('a poem about the sea'), [], 'unrelated text yields no topics');
const multi = classifyTopics('Obesity, diet and heart disease in a cohort');
assert.ok(multi.includes('Nutrition') && multi.includes('Cardiovascular health'), 'multiple topics detected');

/* ---------- normalization ---------- */
const norm = normalizeArticle({
  externalId: 'PMC1', title: 'Diabetes glucose control study',
  abstract: 'A randomized controlled trial of glucose lowering therapy in diabetic adults with substantial detail.'
}, 'europepmc');
assert.strictEqual(norm.status, STATES.DISCOVERED, 'normalized to discovered');
assert.ok(norm.topics.includes('Diabetes'), 'topics applied during normalization');
assert.ok(norm.evidence, 'evidence classified during normalization');
assert.ok(Array.isArray(norm.highRiskFlags), 'high-risk flags computed during normalization');
assert.strictEqual(norm.sourceId, 'europepmc', 'source id applied');

/* ---------- title similarity (dedup heuristic) ---------- */
assert.strictEqual(titlesSimilar('Effect of drug X on blood pressure', 'Effect of drug X on blood pressure in adults'), true, 'near-identical titles similar');
assert.strictEqual(titlesSimilar('Effect of drug X on blood pressure', 'A poem about the open sea and weather'), false, 'unrelated titles differ');
assert.strictEqual(titlesSimilar('', 'x'), false, 'empty titles never match');

/* ---------- idempotent upsert / dedup ---------- */
const first = upsertArticle(normalizeArticle({ externalId: 'PMC1', title: 'Diabetes glucose control study', abstract: 'Abstract text long enough to be normalized and stored correctly.' }, 'europepmc'));
assert.strictEqual(first.created, true, 'first insert creates');
assert.strictEqual(listArticles().length, 1, 'one article stored');

const same = upsertArticle(normalizeArticle({ externalId: 'PMC1', title: 'Diabetes glucose control study', abstract: 'Abstract text long enough to be normalized and stored correctly.' }, 'europepmc'));
assert.strictEqual(same.created, false, 'same externalId is a duplicate');
assert.strictEqual(same.duplicateOf, first.article.id, 'duplicate points at existing');
assert.strictEqual(listArticles().length, 1, 'no new record for duplicate');

// same title, different externalId, within window -> merged
const nearDup = upsertArticle(normalizeArticle({
  externalId: 'PMC2', title: 'Diabetes glucose control study',
  abstract: 'A second copy with the same title but a different identifier and a longer abstract body for merge testing.',
  publishedAt: new Date().toISOString()
}, 'pubmed'));
assert.strictEqual(nearDup.created, false, 'similar title within window merges');
assert.strictEqual(listArticles().length, 1, 'still one record after near-duplicate');

// unrelated title -> new record
const other = upsertArticle(normalizeArticle({
  externalId: 'CT9', title: 'A completely different trial about knee surgery recovery',
  abstract: 'Unrelated content that should not merge with the diabetes record at all, plenty of text here.'
}, 'clinicaltrialsgov'));
assert.strictEqual(other.created, true, 'unrelated article is created');
assert.strictEqual(listArticles().length, 2, 'now two records');

/* ---------- same title but far-apart dates -> do NOT merge ---------- */
const oldPaper = upsertArticle(normalizeArticle({
  externalId: 'P1', title: 'Long term outcomes of cardiac rehabilitation therapy',
  abstract: 'A retrospective cohort study from the year two thousand and nineteen with a reasonably long abstract.',
  publishedAt: '2019-01-01'
}, 'pubmed'));
const newPaper = upsertArticle(normalizeArticle({
  externalId: 'P2', title: 'Long term outcomes of cardiac rehabilitation therapy',
  abstract: 'A retrospective cohort study from the year two thousand and twenty four with a reasonably long abstract.',
  publishedAt: '2024-01-01'
}, 'pubmed'));
assert.strictEqual(oldPaper.created, true, 'older paper inserted');
assert.strictEqual(newPaper.created, true, 'same title years apart is a distinct record (window enforced)');

/* ---------- dedup key stability ---------- */
assert.strictEqual(dedupKey({ sourceId: 'x', externalId: 'y' }), dedupKey({ sourceId: 'x', externalId: 'y' }), 'dedup key is stable');
assert.notStrictEqual(dedupKey({ sourceId: 'x', externalId: 'y' }), dedupKey({ sourceId: 'x', externalId: 'z' }), 'dedup key distinguishes external ids');
assert.notStrictEqual(dedupKey({ sourceId: 'x', externalId: 'y' }), dedupKey({ sourceId: 'z', externalId: 'y' }), 'dedup key distinguishes sources');

console.log('[PASS] research-normalize.test.mjs — topics, dedup, normalization OK');
process.exit(0);
