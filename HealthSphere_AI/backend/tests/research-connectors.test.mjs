import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.tmpdir(), `hs_research_conn_${Date.now()}`);
process.env.RESEARCH_DATA_DIR = DIR;
fs.mkdirSync(DIR, { recursive: true });

const { europepmc, clinicaltrials, pubmed, whoDon, ensureSourceRegistry, syncSource } = await import('../lib/research/connectors.js');
const { listSources, listTopics, listArticles, listSyncLogs } = await import('../lib/research/store.js');

const realFetch = globalThis.fetch;
let hitCount = 0;
function mockRouter(routes) {
  globalThis.fetch = async (url) => {
    hitCount++;
    const u = String(url);
    for (const [needle, handler] of routes) {
      if (u.includes(needle)) return handler(u);
    }
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => ({}) };
  };
}
const json200 = obj => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj, text: async () => JSON.stringify(obj) });

/* ---------- 1. Europe PMC: parse, skip malformed, count duplicates ---------- */
const epmcPayload = {
  resultList: { result: [
    { id: 'A1', title: 'Diabetes and glucose metabolism', abstractText: '<h4>Background</h4> A study of glucose.', authorString: 'A B, C D', doi: '10.1/a', pubTypeList: { pubType: ['Journal Article'] }, isOpenAccess: 'Y' },
    { id: 'A2', authorString: 'X Y' }, // malformed: no title -> skipped
    { id: 'A3', title: 'Cancer immunotherapy review', abstractText: 'A systematic review of immunotherapy.', pubTypeList: { pubType: ['Review'] } }
  ] }
};
mockRouter([['ebi.ac.uk/europepmc', () => json200(epmcPayload)]]);
let r = await europepmc.sync({ id: 'europepmc', baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest' }, { pageSize: 25, maxPages: 1 });
assert.strictEqual(r.fetched, 2, 'europepmc fetched the two valid records');
assert.strictEqual(r.created, 2, 'europepmc created two articles');
assert.strictEqual(r.duplicates, 0, 'no duplicates on first pass');

r = await europepmc.sync({ id: 'europepmc', baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest' }, { pageSize: 25, maxPages: 1 });
assert.strictEqual(r.created, 0, 're-sync creates nothing');
assert.strictEqual(r.duplicates, 2, 're-sync detected as duplicates');

/* ---------- 2. retry: transient 500 then success ---------- */
let attempts = 0;
mockRouter([['ebi.ac.uk/europepmc', () => {
  attempts++;
  if (attempts === 1) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
  return json200({ resultList: { result: [{ id: 'RETRY1', title: 'Recovered after retry', abstractText: 'Long enough abstract for normalization to succeed here.' }] } });
}]]);
const before = listArticles().length;
r = await europepmc.sync({ id: 'europepmc', baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest' }, { maxPages: 1 });
assert.ok(attempts >= 2, 'fetch retried after 500');
assert.strictEqual(r.created, 1, 'record ingested after retry');
assert.strictEqual(listArticles().length, before + 1, 'one new article stored');

/* ---------- 3. ClinicalTrials.gov: full + partial records ---------- */
mockRouter([['clinicaltrials.gov', () => json200({ studies: [
  { protocolSection: { identificationModule: { nctId: 'NCT1', briefTitle: 'Trial one' }, descriptionModule: { briefSummary: 'A randomized double-blind trial of an intervention.' }, statusModule: { startDateStruct: { date: '2024-01-01' }, lastUpdateSubmitDate: '2024-02-01' }, designModule: { phases: ['PHASE3'] } } },
  { protocolSection: { identificationModule: {} } }
] })]]);
r = await clinicaltrials.sync({ id: 'clinicaltrialsgov', baseUrl: 'https://clinicaltrials.gov/api/v2' }, { maxPages: 1 });
assert.strictEqual(r.created, 1, 'clinicaltrials created only the complete study');
assert.ok(listArticles().some(a => a.sourceId === 'clinicaltrialsgov' && a.articleType === 'trial'), 'trial record stored');

/* ---------- 4. PubMed E-utilities: esearch + esummary ---------- */
mockRouter([
  ['esearch.fcgi', () => json200({ esearchresult: { idlist: ['111', '222'], webenv: 'W' } })],
  ['esummary.fcgi', () => json200({ result: {
    '111': { title: 'PubMed paper one', authors: [{ name: 'A B' }], fulljournalname: 'J Med', source: 'J Med', pubdate: '2024 Jan', articleids: [{ idtype: 'doi', value: '10.9/x' }], pubtype: ['Journal Article'] },
    '222': { title: 'PubMed review two', authors: [], fulljournalname: 'J Rev', pubdate: '2023 Feb', articleids: [], pubtype: ['Review'] }
  } })]
]);
r = await pubmed.sync({ id: 'pubmed', baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils' }, { maxPages: 1, pageSize: 25 });
assert.strictEqual(r.created, 2, 'pubmed created both records');

/* ---------- 5. WHO DON RSS: CDATA + entities ---------- */
const rss = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[Disease Outbreak News: Cholera in Country X]]></title><link>https://who.int/x1</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description><![CDATA[An <b>outbreak</b> of cholera &amp; related illness.]]></description></item>
  <item><title>Disease Outbreak News: Measles cluster</title><link>https://who.int/x2</link><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate><description>Measles cases rising.</description></item>
  <item><title>Missing link item</title></item>
</channel></rss>`;
mockRouter([['who.int/feeds', () => ({ ok: true, status: 200, text: async () => rss, json: async () => ({}) })]]);
r = await whoDon.sync({ id: 'who-don', config: { feedUrl: 'https://who.int/feeds/entity/don/en/rss.xml' } }, { maxPages: 1 });
assert.strictEqual(r.created, 2, 'whoDon created the two valid items');
const alert = listArticles().find(a => a.sourceId === 'who-don');
assert.ok(alert && alert.articleType === 'alert', 'whoDon items stored as alerts');
assert.ok(!/Disease Outbreak News/.test(alert.title), 'boilerplate prefix stripped from title');
assert.ok(!/<[^>]+>/.test(alert.abstract), 'html stripped from description');

/* ---------- 6. manual connector never syncs ---------- */
const manual = await syncSource('cdc');
assert.strictEqual(manual.ok, false, 'manual connector reports not-ok');
assert.ok(listSyncLogs().some(l => l.sourceId === 'cdc' && l.ok === false), 'manual sync is logged');

/* ---------- 7. registry seeds sources + topic catalog ---------- */
ensureSourceRegistry();
assert.strictEqual(listSources().length, 7, 'seven default sources registered');
assert.ok(listSources().some(s => s.id === 'europepmc' && s.enabled), 'europepmc enabled by default');
assert.ok(listSources().some(s => s.id === 'cdc' && !s.enabled), 'manual sources disabled by default');
assert.strictEqual(listTopics().length, 10, 'topic catalog seeded');

globalThis.fetch = realFetch;
console.log('[PASS] research-connectors.test.mjs — connectors, retries, malformed data OK');
process.exit(0);
