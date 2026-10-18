import assert from 'node:assert';
import {
  STATES, EVIDENCE, transitionState, classifyEvidence, needsHumanReview,
  newArticle, validateArticle, publicArticle
} from '../lib/research/schema.js';

/* ---------- article factory + validation ---------- */
const base = newArticle({
  sourceId: 'europepmc', externalId: 'PMC123', title: 'A randomized controlled trial of drug X',
  abstract: 'We conducted a randomized double-blind placebo-controlled trial. Results were significant.',
  url: 'https://example.org/x', articleType: 'trial', studyType: 'Phase 3 RCT'
});
assert.ok(base.id && base.id.startsWith('art_'), 'newArticle assigns an id');
assert.strictEqual(base.status, STATES.DISCOVERED, 'new articles start discovered');
assert.strictEqual(base.version, 1, 'version starts at 1');
assert.ok(base.retrievedAt && !Number.isNaN(Date.parse(base.retrievedAt)), 'retrievedAt set at creation');
assert.ok(Array.isArray(base.history) && base.history.length === 0, 'history starts empty');

assert.doesNotThrow(() => validateArticle(base), 'valid article passes');
assert.throws(() => validateArticle({ ...base, title: '' }), /title is required/i, 'empty title rejected');
assert.throws(() => validateArticle({ ...base, url: null, doi: null, pmid: null, externalId: null }), /external identifier/i, 'identifier required');
assert.throws(() => validateArticle({ ...base, publishedAt: 'not-a-date' }), /valid date/i, 'bad date rejected');
assert.throws(() => validateArticle({ ...base, topics: 'nope' }), /topics must be an array/i, 'bad topics rejected');

/* ---------- evidence classification ---------- */
assert.strictEqual(classifyEvidence({ title: 'WHO guideline on hypertension' }), EVIDENCE.ESTABLISHED_GUIDANCE, 'guidance detected');
assert.strictEqual(classifyEvidence({ title: 'X', abstract: 'phase 2 safety study', articleType: 'trial' }), EVIDENCE.EXPERIMENTAL, 'trial phase -> experimental');
assert.strictEqual(classifyEvidence({ title: 'X', abstract: 'A trial', articleType: 'trial' }), EVIDENCE.RCT, 'unphased trial -> rct');
assert.strictEqual(classifyEvidence({ title: 'X', preprint: true }), EVIDENCE.PREPRINT, 'preprint flag');
assert.strictEqual(classifyEvidence({ title: 'A systematic review and meta-analysis of Y' }), EVIDENCE.SYSTEMATIC_REVIEW, 'review detected');
assert.strictEqual(classifyEvidence({ title: 'X', abstract: 'randomized placebo-controlled' }), EVIDENCE.RCT, 'rct phrase');
assert.strictEqual(classifyEvidence({ title: 'X', abstract: 'murine animal model study' }), EVIDENCE.PRECLINICAL, 'preclinical detected');
assert.strictEqual(classifyEvidence({ title: 'X', abstract: 'prospective cohort study' }), EVIDENCE.OBSERVATIONAL, 'default observational');

/* ---------- high-risk review flags ---------- */
assert.deepStrictEqual(needsHumanReview({ title: 'New breakthrough cure for cancer' }), ['possible-cure-claim'], 'cure claim flagged');
assert.ok(needsHumanReview({ title: 'Cholera outbreak spreads in region' }).includes('outbreak-warning'), 'outbreak flagged');
assert.ok(needsHumanReview({ title: 'Stop taking your medication, say influencers' }).includes('treatment-interference'), 'interference flagged');
assert.ok(needsHumanReview({ title: 'Experimental therapy shows promise', abstract: 'an investigational drug treatment' }).includes('investigational-therapy'), 'investigational flagged');
assert.ok(needsHumanReview({ title: 'X', preprint: true }).includes('preprint'), 'preprint flagged');
assert.deepStrictEqual(needsHumanReview({ title: 'Routine observational study of diet', abstract: 'cohort of adults' }), [], 'benign content has no flags');

/* ---------- publication state machine ---------- */
const a = newArticle({ sourceId: 's', externalId: 'e', title: 'T' });
transitionState(a, STATES.INGESTED, { by: 'test' });
assert.strictEqual(a.status, STATES.INGESTED, 'discovered -> ingested');
transitionState(a, STATES.PROCESSING, { by: 'test' });
transitionState(a, STATES.SUMMARY_PENDING_REVIEW, { by: 'test' });
transitionState(a, STATES.PUBLISHED, { by: 'test' });
assert.strictEqual(a.history.length, 4, 'history records every transition');

// high-risk path
const b = newArticle({ sourceId: 's', externalId: 'e2', title: 'T2' });
transitionState(b, STATES.INGESTED);
transitionState(b, STATES.PROCESSING);
transitionState(b, STATES.PENDING_REVIEW);
assert.strictEqual(b.status, STATES.PENDING_REVIEW, 'processing -> pending_review allowed');
transitionState(b, STATES.REJECTED);
assert.strictEqual(b.status, STATES.REJECTED, 'pending_review -> rejected allowed');
transitionState(b, STATES.ARCHIVED);
assert.strictEqual(b.status, STATES.ARCHIVED, 'rejected -> archived allowed');

// illegal transitions throw
assert.throws(() => transitionState(a, STATES.INGESTED), /Invalid publication transition/i, 'no backward transitions');
assert.throws(() => transitionState(b, STATES.PUBLISHED), /Invalid publication transition/i, 'archived is terminal');
const c = newArticle({ sourceId: 's', externalId: 'e3', title: 'T3' });
assert.throws(() => transitionState(c, STATES.PUBLISHED), /Invalid publication transition/i, 'cannot skip states');

/* ---------- public projection ---------- */
const pub = publicArticle({ ...base, evidence: EVIDENCE.RCT, highRiskFlags: ['preprint'] });
assert.strictEqual(pub.evidence, EVIDENCE.RCT, 'evidence exposed');
assert.deepStrictEqual(pub.highRisk, ['preprint'], 'high-risk flags exposed');
assert.ok(!('highRiskFlags' in pub), 'internal field names never leak');
assert.ok(!('passwordHash' in pub), 'no unrelated fields leak');

console.log('[PASS] research-schema.test.mjs — states, evidence, flags, validation OK');
process.exit(0);
