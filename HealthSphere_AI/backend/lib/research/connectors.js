/* HealthSphere Research Hub — source connectors.
   Only official, key-less APIs/feeds are implemented:
     • Europe PMC REST (biomedical literature + abstracts)
     • ClinicalTrials.gov API v2 (clinical trials)
     • PubMed via NCBI E-utilities (PMID + metadata)
     • WHO Disease Outbreak News (RSS)
   CDC / MoHFW / IMR have no stable key-less feed as of implementation —
   they are registered as `manual` connectors (admin can add records by hand)
   rather than being silently scraped. Every connector is behind the same
   interface so new approved sources can be added without pipeline changes. */

import { normalizeArticle, upsertArticle, TOPIC_CATALOG } from './normalize.js';
import { listArticles, addSyncLog, upsertSource, listTopics, replaceTopics } from './store.js';

/* ---------------- shared HTTP with timeout + retry + backoff ---------------- */
export async function fetchJson(url, { timeoutMs = 10000, retries = 3, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: { 'User-Agent': 'HealthSphere-ResearchHub/1.0 (educational; contact: demo@healthsphere.ai)', ...headers }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(Math.max(retryAfter * 1000, backoffMs(attempt)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(backoffMs(attempt)); // exponential backoff + jitter
    }
  }
  throw lastErr;
}

export async function fetchText(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 10000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}
const backoffMs = attempt => Math.min(30000, 2 ** attempt * 500) * (0.75 + Math.random() * 0.5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- rate limiter (per source, token bucket-ish) ---------------- */
const buckets = new Map();
export async function rateLimit(sourceId, minIntervalMs = 1100) {
  const now = Date.now();
  const last = buckets.get(sourceId) || 0;
  const wait = Math.max(0, last + minIntervalMs - now);
  if (wait) await sleep(wait);
  buckets.set(sourceId, Date.now());
}

/* ---------------- connector: Europe PMC ---------------- */
export const europepmc = {
  id: 'europepmc',
  name: 'Europe PMC',
  baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
  category: 'biomedical-literature',
  connectorType: 'rest',
  trustTier: 'official',
  async sync(source, { pageSize = 25, maxPages = 2, query } = {}) {
    const q = query || source.config?.query || '(COVID-19 OR "infectious disease" OR diabetes OR cancer) AND FIRST_PDATE:[2024-01-01 TO *]';
    let cursor = '*';
    let fetched = 0, created = 0, duplicates = 0;
    for (let page = 0; page < maxPages; page++) {
      await rateLimit(source.id, 700);
      const url = `${source.baseUrl}/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${pageSize}&cursorMark=${encodeURIComponent(cursor)}`;
      const data = await fetchJson(url);
      for (const r of (data.resultList?.result || [])) {
        const raw = await normalizeEuropepmc(r, source);
        if (!raw) continue; // skip malformed records missing a title
        const res = upsertArticle(normalizeArticle(raw, source.id));
        res.created ? created++ : duplicates++;
        fetched++;
      }
      cursor = data.nextCursorMark;
      if (!cursor || cursor === (data.cursorMark) || !data.resultList?.result?.length) break;
    }
    return { fetched, created, duplicates };
  }
};

async function normalizeEuropepmc(r, source) {
  if (!r.title) return null;
  return {
    sourceId: source.id,
    externalId: r.id || r.source + ':' + r.id,
    title: r.title,
    abstract: (r.abstractText || '').replace(/<[^>]+>/g, ' ').slice(0, 20000),
    authors: (r.authorString || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50),
    publisher: r.publisher || null,
    journal: r.journalTitle || null,
    url: r.doi ? `https://doi.org/${r.doi}` : (r.fullTextUrlList?.fullTextUrl?.[0]?.url || `https://europepmc.org/article/${r.source}/${r.id}`),
    doi: r.doi || null,
    pmid: r.pmid || null,
    publishedAt: r.firstPublicationDate || r.firstIndexDate || null,
    modifiedAt: r.firstIndexDate || null,
    articleType: r.pubTypeList?.pubType?.some(t => /review/i.test(t)) ? 'paper' : 'paper',
    studyType: (r.pubTypeList?.pubType || []).join('; ') || null,
    preprint: /preprint/i.test(r.source || '') || /preprint/i.test(r.journalTitle || ''),
    openAccess: r.isOpenAccess === 'Y',
    language: r.language || 'en'
  };
}

/* ---------------- connector: ClinicalTrials.gov v2 ---------------- */
export const clinicaltrials = {
  id: 'clinicaltrialsgov',
  name: 'ClinicalTrials.gov',
  baseUrl: 'https://clinicaltrials.gov/api/v2',
  category: 'clinical-trials',
  connectorType: 'rest',
  trustTier: 'official',
  async sync(source, { pageSize = 20, maxPages = 2, query } = {}) {
    const q = query || source.config?.query || 'AREA[LastUpdatePostDate]RANGE[2024-01-01, MAX]';
    let pageToken = null;
    let fetched = 0, created = 0, duplicates = 0;
    for (let page = 0; page < maxPages; page++) {
      await rateLimit(source.id, 400);
      const params = new URLSearchParams({ query: q, pageSize: String(pageSize) });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await fetchJson(`${source.baseUrl}/studies?${params}`);
      for (const s of (data.studies || [])) {
        const prot = s.protocolSection || {};
        const id = prot.identificationModule?.nctId;
        if (!id) continue;
        const res = upsertArticle(normalizeArticle({
          sourceId: source.id, externalId: id,
          title: prot.identificationModule?.briefTitle || id,
          abstract: (prot.descriptionModule?.briefSummary || '').slice(0, 20000),
          authors: (prot.officialTitle ? [prot.officialTitle] : []),
          publisher: prot.identificationModule?.organization?.fullName || null,
          journal: null,
          url: `https://clinicaltrials.gov/study/${id}`,
          doi: null, pmid: null,
          publishedAt: prot.statusModule?.startDateStruct?.date || null,
          modifiedAt: s.protocolSection?.statusModule?.lastUpdateSubmitDate || null,
          articleType: 'trial',
          studyType: (prot.designModule?.phases || []).map(p => `Phase ${p}`).join('; ') || 'Trial',
          openAccess: true,
          language: 'en'
        }, source.id));
        res.created ? created++ : duplicates++;
        fetched++;
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return { fetched, created, duplicates };
  }
};

/* ---------------- connector: PubMed E-utilities ---------------- */
export const pubmed = {
  id: 'pubmed',
  name: 'PubMed (NCBI E-utilities)',
  baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
  category: 'biomedical-literature',
  connectorType: 'rest',
  trustTier: 'official',
  async sync(source, { pageSize = 25, maxPages = 2, query } = {}) {
    const q = query || source.config?.query || 'diabetes AND 2024:3000[dp]';
    let webenv = null;
    let fetched = 0, created = 0, duplicates = 0;
    for (let page = 0; page < maxPages; page++) {
      await rateLimit(source.id, 400); // NCBI: ~3 req/s without API key
      let ids = [];
      if (!webenv) {
        const es = await fetchJson(`${source.baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${pageSize}&retmode=json&sort=date`);
        ids = es.esearchresult?.idlist || [];
        webenv = es.esearchresult?.webenv;
      } else {
        const es = await fetchJson(`${source.baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${pageSize}&retmode=json&webenv=${encodeURIComponent(webenv)}&retstart=${(page) * pageSize}`);
        ids = es.esearchresult?.idlist || [];
      }
      if (!ids.length) break;
      const sum = await fetchJson(`${source.baseUrl}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`);
      for (const id of ids) {
        const r = sum.result?.[id];
        if (!r || !r.title) continue;
        const res = upsertArticle(normalizeArticle({
          sourceId: source.id, externalId: `PMID:${id}`,
          title: r.title,
          abstract: '', // E-utilities esummary has no abstract; leave empty — summarizer marks evidence insufficient
          authors: (r.authors || []).map(a => a.name).filter(Boolean).slice(0, 50),
          publisher: r.fulljournalname || r.source || null,
          journal: r.fulljournalname || null,
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          doi: (r.articleids || []).find(a => a.idtype === 'doi')?.value || null,
          pmid: String(id),
          publishedAt: r.pubdate ? toIso(r.pubdate) : null,
          modifiedAt: null,
          articleType: (r.pubtype || []).some(t => /review/i.test(t)) ? 'paper' : 'paper',
          studyType: (r.pubtype || []).join('; ') || null,
          preprint: (r.pubtype || []).some(t => /preprint/i.test(t)),
          openAccess: (r.articleids || []).some(a => a.idtype === 'pmc'),
          language: 'en'
        }, source.id));
        res.created ? created++ : duplicates++;
        fetched++;
      }
    }
    return { fetched, created, duplicates };
  }
};
const toIso = s => { const m = String(s).match(/^(\d{4})[ -]?(\w{3})?[ -]?(\d{0,2})/); if (!m) return null; try { return new Date(`${m[1]} ${m[2] || 'Jan'} ${m[3] || '1'}`).toISOString().slice(0, 10); } catch { return null; } };

/* ---------------- connector: WHO Disease Outbreak News (RSS) ---------------- */
export const whoDon = {
  id: 'who-don',
  name: 'WHO Disease Outbreak News',
  baseUrl: 'https://www.who.int',
  category: 'public-health',
  connectorType: 'rss',
  trustTier: 'official',
  async sync(source, { maxPages = 2 } = {}) {
    await rateLimit(source.id, 1000);
    const xml = await fetchText(source.config?.feedUrl || 'https://www.who.int/feeds/entity/don/en/rss.xml', { timeoutMs: 15000 });
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 30);
    let fetched = 0, created = 0, duplicates = 0;
    for (const it of items) {
      const block = it[1];
      const pick = re => (block.match(re) || [, null])[1];
      const title = decodeXml(pick(/<title>([\s\S]*?)<\/title>/));
      const link = decodeXml(pick(/<link>([\s\S]*?)<\/link>/));
      const pubDate = decodeXml(pick(/<pubDate>([\s\S]*?)<\/pubDate>/));
      if (!title || !link) continue;
      const res = upsertArticle(normalizeArticle({
        sourceId: source.id, externalId: link,
        title: title.replace(/^Disease Outbreak News[: ]*/i, ''),
        abstract: decodeXml(pick(/<description>([\s\S]*?)<\/description>/)).replace(/<[^>]+>/g, ' ').slice(0, 8000),
        authors: ['World Health Organization'],
        publisher: 'World Health Organization',
        journal: null, url: link,
        doi: null, pmid: null,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        modifiedAt: null,
        articleType: 'alert',
        studyType: 'Outbreak news',
        openAccess: true, language: 'en'
      }, source.id));
      res.created ? created++ : duplicates++;
      fetched++;
    }
    return { fetched, created, duplicates };
  }
};
const decodeXml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

/* ---------------- manual placeholders (no key-less official feed) ---------------- */
export const manualConnectors = {
  cdc: { id: 'cdc', name: 'Centers for Disease Control and Prevention', baseUrl: 'https://www.cdc.gov/outbreaks/', category: 'public-health', connectorType: 'manual', trustTier: 'official', note: 'No stable key-less public feed confirmed; admin entry only.' },
  mohfw: { id: 'mohfw', name: 'Ministry of Health & Family Welfare (India)', baseUrl: 'https://www.mohfw.gov.in/', category: 'public-health', connectorType: 'manual', trustTier: 'official', note: 'No stable key-less public feed confirmed; admin entry only.' },
  icmr: { id: 'icmr', name: 'Indian Council of Medical Research', baseUrl: 'https://www.icmr.gov.in/', category: 'public-health', connectorType: 'manual', trustTier: 'official', note: 'No stable key-less public feed confirmed; admin entry only.' }
};

/* ---------------- registry + sync orchestration ---------------- */
export const CONNECTORS = { europepmc, clinicaltrialsgov: clinicaltrials, pubmed, whoDon };

export const DEFAULT_SOURCES = [
  { ...europepmc, enabled: true, intervalMin: 5, rateLimitMs: 700, maxPerSync: 50, trustTier: 'official', license: 'CC BY / CC BY-NC (per article)' },
  { ...clinicaltrials, enabled: true, intervalMin: 5, rateLimitMs: 400, maxPerSync: 40, trustTier: 'official', license: 'Public domain (US government)' },
  { ...pubmed, enabled: true, intervalMin: 5, rateLimitMs: 400, maxPerSync: 50, trustTier: 'official', license: 'Metadata: public; full-text per publisher' },
  { ...whoDon, enabled: true, intervalMin: 5, rateLimitMs: 1000, maxPerSync: 30, trustTier: 'official', license: 'WHO terms of use' },
  { ...manualConnectors.cdc, enabled: false, intervalMin: 60, rateLimitMs: 0, maxPerSync: 0, trustTier: 'official', license: '—' },
  { ...manualConnectors.mohfw, enabled: false, intervalMin: 60, rateLimitMs: 0, maxPerSync: 0, trustTier: 'official', license: '—' },
  { ...manualConnectors.icmr, enabled: false, intervalMin: 60, rateLimitMs: 0, maxPerSync: 0, trustTier: 'official', license: '—' }
];

/** Initialize registry from defaults (first run only; never overwrites admin edits). */
export function ensureSourceRegistry() {
  for (const s of DEFAULT_SOURCES) {
    const existing = upsertSource({ ...s });
    if (!existing.lastSyncAttemptAt) upsertSource({ ...s });
  }
  if (!listTopics().length) replaceTopics(TOPIC_CATALOG.map(t => ({ ...t })));
}

/** Run one sync for a source. Never throws — failures are logged, not raised. */
export async function syncSource(sourceId, { query } = {}) {
  const src = upsertSource({ id: sourceId, lastSyncAttemptAt: new Date().toISOString() });
  const connector = CONNECTORS[sourceId];
  if (!connector || connector.connectorType === 'manual') {
    addSyncLog({ sourceId, ok: false, note: 'manual connector — no automated sync' });
    upsertSource({ id: sourceId, lastSyncOk: false });
    return { ok: false, note: 'manual connector' };
  }
  try {
    const res = await connector.sync({ ...src, config: src.config || {} }, { maxPages: 2 });
    upsertSource({ id: sourceId, lastSyncOk: true, lastSyncAt: new Date().toISOString() });
    addSyncLog({ sourceId, ok: true, ...res });
    return { ok: true, ...res };
  } catch (e) {
    upsertSource({ id: sourceId, lastSyncOk: false });
    addSyncLog({ sourceId, ok: false, note: e.message.slice(0, 300) });
    return { ok: false, note: e.message };
  }
}

export async function syncAll() {
  const results = {};
  for (const s of listSources().filter(s => s.enabled)) results[s.id] = await syncSource(s.id);
  return results;
}
