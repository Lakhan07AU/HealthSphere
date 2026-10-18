/* ---------- Research Hub views: dashboard · diseases · explorer · saved · prefs · admin ---------- */

const RH_BASE = '/api/research';
const RH_ADMIN_BASE = '/api/admin/research';

async function rhApi(path, opts = {}) {
  const res = await fetch(RH_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}
async function rhAdminApi(path, opts = {}) {
  const res = await fetch(RH_ADMIN_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}

/* ---- 5-minute auto-refresh ----------------------------------------------
   Research screens re-fetch in place so newly ingested articles appear
   without a manual reload (like a news feed). One timer exists at a time:
   each screen replaces it, and it self-clears if the user navigates away. */
const RH_REFRESH_MS = 5 * 60 * 1000;
let rhRefreshTimer = null;
function rhAutoRefresh(hashRoute, refetch) {
  if (rhRefreshTimer) clearInterval(rhRefreshTimer);
  const key = hashRoute.split('?')[0];
  rhRefreshTimer = setInterval(async () => {
    if (location.hash.split('?')[0] !== key) {
      clearInterval(rhRefreshTimer);
      rhRefreshTimer = null;
      return;
    }
    try { await refetch(); } catch { /* keep last good render on a transient error */ }
  }, RH_REFRESH_MS);
}

const EVIDENCE_LABELS = {
  established_guidance: ['Established guidance', 'ok'],
  systematic_review: ['Systematic review / meta-analysis', 'info'],
  rct: ['Randomized controlled trial', 'info'],
  observational: ['Observational study', 'neutral'],
  preclinical: ['Preclinical (lab/animal)', 'warn'],
  preprint: ['Preprint (not peer-reviewed)', 'warn'],
  experimental: ['Experimental / investigational', 'warn'],
  unsupported: ['Unsupported / contradicted', 'danger']
};
const evidenceChip = ev => { const [l, c] = EVIDENCE_LABELS[ev] || [ev || 'Unclassified', 'neutral']; return `<span class="chip ${c}">${l}</span>`; };
const fmtDate = s => { try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return '—'; } };
const escRh = esc;

function articleCard(a) {
  return `<div class="card rh-card" data-article="${a.id}">
    <div class="spread" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <span class="chip neutral">${escRh(a.articleType)}</span>
          ${evidenceChip(a.evidence)}
          ${a.preprint ? '<span class="chip warn">preprint</span>' : ''}
          ${a.openAccess ? '<span class="chip ok">open access</span>' : ''}
        </div>
        <a href="#/research/article/${a.id}" style="font-family:var(--font-display);font-weight:800;font-size:15px;color:#0F1F33">${escRh(a.title)}</a>
        <div class="page-sub" style="margin-top:4px">${escRh(a.publisher || a.journal || a.sourceId || '')}</div>
        <div class="page-sub">${fmtDate(a.publishedAt)}${a.retrievedAt ? ` · retrieved ${fmtDate(a.retrievedAt)}` : ''}</div>
        ${a.topics && a.topics.length ? `<div class="row mt" style="gap:6px;flex-wrap:wrap">${a.topics.map(t => `<span class="chip neutral">${escRh(t)}</span>`).join('')}</div>` : ''}
      </div>
      <button class="btn sm ${a._saved ? '' : 'secondary'}" data-save="${a.id}">${a._saved ? '★ Saved' : '☆ Save'}</button>
    </div>
  </div>`;
}

async function rhArticleList(container, { q = '', topic = '', evidence = '', articleType = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (topic) params.set('topic', topic);
  if (evidence) params.set('evidence', evidence);
  if (articleType) params.set('articleType', articleType);
  params.set('pageSize', '20');
  const [data, saved] = await Promise.all([
    rhApi(`/articles?${params}`),
    rhApi('/saved').catch(() => ({ items: [] }))
  ]);
  const savedIds = new Set(saved.items.map(s => s.articleId));
  data.items.forEach(a => { a._saved = savedIds.has(a.id); });
  return data;
}

/* ================= DASHBOARD ================= */
VIEWS.research = async function (container) {
  container.innerHTML = `
    <div class="topbar"><div><h1>Research Hub</h1>
      <div class="page-sub">Source-backed medical research and public-health education. Not a source of personal medical advice.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research" class="on">Dashboard</a>
      <a href="#/research/diseases">Disease &amp; Virus Watch</a>
      <a href="#/research/explorer">Paper Explorer</a>
      <a href="#/research/saved">Saved Articles</a>
      <a href="#/research/preferences">My Interests</a>
      ${App.user?.isAdmin ? '<a href="#/research/admin/sources">Source Management</a><a href="#/research/admin/review">Content Review</a>' : ''}
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  const renderFeed = async () => {
    const [feed, topics, prefs] = await Promise.all([
      rhApi('/articles?pageSize=12').catch(e => ({ items: [], error: e.message })),
      rhApi('/topics').catch(() => ({ topics: [] })),
      rhApi('/preferences').catch(() => null)
    ]);
    const interestSet = new Set(prefs?.interests || []);
    const feedItems = feed.items || [];
    const personalized = feedItems.filter(a => (a.topics || []).some(t => interestSet.has(t)));
    body.innerHTML = `
      <div class="grid g2">
        <div class="card">
          <h2>Latest research</h2>
          ${feedItems.length ? feedItems.slice(0, 6).map(articleCard).join('') : `<div class="empty">No research articles yet. Ask an admin to run a source synchronization, or check back soon.</div>`}
          <div class="mt"><a class="btn sm" href="#/research/explorer">Browse all research</a></div>
        </div>
        <div>
          <div class="card mb">
            <h2>For your interests</h2>
            ${interestSet.size
              ? (personalized.length ? personalized.slice(0, 4).map(articleCard).join('') : `<div class="empty">Nothing new in your interest areas yet.</div>`)
              : '<div class="empty">Pick topics in <a href="#/research/preferences">My Interests</a> to personalize this feed.</div>'}
          </div>
          <div class="card">
            <h2>Topics</h2>
            <div class="row" style="gap:6px;flex-wrap:wrap">${(topics.topics || []).map(t => `<a class="chip neutral" href="#/research/explorer?topic=${encodeURIComponent(t)}">${escRh(t)}</a>`).join('')}</div>
          </div>
        </div>
      </div>`;
    wireCards(body);
  };
  try { await renderFeed(); } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load the research feed: ${escRh(e.message)}<br><br><button class="btn" onclick="VIEWS.research(document.getElementById('app'))">Retry</button></div>`;
  }
  rhAutoRefresh('#/research', renderFeed);
};

/* ================= DISEASE & VIRUS WATCH ================= */
VIEWS.researchDiseases = async function (container) {
  container.innerHTML = `
    <div class="topbar"><div><h1>Disease &amp; Virus Watch</h1>
      <div class="page-sub">Official outbreak notices and disease-related developments. Distinguishes confirmed official reports from preliminary research.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a>
      <a href="#/research/diseases" class="on">Disease &amp; Virus Watch</a>
      <a href="#/research/explorer">Paper Explorer</a>
      <a href="#/research/saved">Saved Articles</a>
      <a href="#/research/preferences">My Interests</a>
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  const renderWatch = async () => {
    const data = await rhApi('/diseases');
    body.innerHTML = `
      <div class="disclaimer">Entries below come from official public-health sources. Absence of an entry is not evidence that no development occurred — it means no synchronized official report was available.</div>
      <h2>Official alerts</h2>
      ${data.officialAlerts && data.officialAlerts.length
        ? `<div class="row" style="flex-direction:column;gap:8px">${data.officialAlerts.map(a => `
          <div class="card" style="border-left:4px solid var(--destructive)">
            <b>${escRh(a.title)}</b>
            <div class="page-sub">${escRh(a.publisher || '')} · announced ${fmtDate(a.announcedAt)} · retrieved ${fmtDate(a.retrievedAt)}</div>
            <div class="mt"><a class="btn sm" href="${escRh(a.url || '#')}" target="_blank" rel="noopener noreferrer">Read official report</a></div>
          </div>`).join('')}</div>`
        : '<div class="empty mb">No official alerts currently recorded.</div>'}
      <h2>Disease-related research &amp; watchlist</h2>
      <div class="row" style="flex-direction:column;gap:12px">
        ${data.watchlist.length ? data.watchlist.map(articleCard).join('') : '<div class="empty">No disease-related research articles yet.</div>'}
      </div>`;
    wireCards(body);
  };
  try { await renderWatch(); } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load disease watch: ${escRh(e.message)}<br><br><button class="btn" onclick="VIEWS.researchDiseases(document.getElementById('app'))">Retry</button></div>`;
  }
  rhAutoRefresh('#/research/diseases', renderWatch);
};

/* ================= PAPER EXPLORER ================= */
VIEWS.researchExplorer = async function (container) {
  const topic = new URLSearchParams((location.hash.split('?')[1] || '')).get('topic') || '';
  container.innerHTML = `
    <div class="topbar"><div><h1>Research Paper Explorer</h1>
      <div class="page-sub">Search biomedical publications and trials. Always review the original source.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a>
      <a href="#/research/diseases">Disease &amp; Virus Watch</a>
      <a href="#/research/explorer" class="on">Paper Explorer</a>
      <a href="#/research/saved">Saved Articles</a>
      <a href="#/research/preferences">My Interests</a>
    </div>
    <div class="card mb">
      <div class="grid g4">
        <div><label>Search</label><input id="rh-q" placeholder="Keyword, title, topic…" value="${escRh(topic)}"></div>
        <div><label>Article type</label><select id="rh-type"><option value="">All</option><option value="paper">Papers</option><option value="trial">Clinical trials</option><option value="alert">Outbreak alerts</option><option value="guidance">Guidance</option></select></div>
        <div><label>Evidence category</label><select id="rh-ev">${['', 'established_guidance', 'systematic_review', 'rct', 'observational', 'preclinical', 'preprint', 'experimental', 'unsupported'].map(e => `<option value="${e}">${e ? EVIDENCE_LABELS[e][0] : 'All'}</option>`).join('')}</select></div>
        <div style="display:flex;align-items:flex-end"><button class="btn" id="rh-search">Search</button></div>
      </div>
    </div>
    <div id="rh-results"><span class="spin"></span></div>`;
  const results = container.querySelector('#rh-results');
  async function runSearch() {
    results.innerHTML = '<span class="spin"></span>';
    try {
      const data = await rhArticleList(results, {
        q: container.querySelector('#rh-q').value.trim(),
        topic: new URLSearchParams(location.hash.split('?')[1] || '').get('topic') || '',
        evidence: container.querySelector('#rh-ev').value,
        articleType: container.querySelector('#rh-type').value
      });
      results.innerHTML = data.items.length
        ? `<div class="row" style="flex-direction:column;gap:12px">${data.items.map(articleCard).join('')}</div>
           <div class="page-sub mt">${data.total} result${data.total === 1 ? '' : 's'}</div>`
        : '<div class="empty">No articles matched your filters.</div>';
      wireCards(results);
    } catch (e) {
      results.innerHTML = `<div class="card empty">Search failed: ${escRh(e.message)}</div>`;
    }
  }
  container.querySelector('#rh-search').onclick = runSearch;
  container.querySelector('#rh-q').onkeydown = e => { if (e.key === 'Enter') runSearch(); };
  await runSearch();
  rhAutoRefresh('#/research/explorer', async () => {
    const a = document.activeElement;
    if (a && (a.id === 'rh-q' || a.id === 'rh-ev' || a.id === 'rh-type')) return; // don't clobber typing
    await runSearch();
  });
};

/* ================= ARTICLE DETAIL ================= */
VIEWS.researchArticle = async function (container, id) {
  container.innerHTML = `<div class="topbar"><div><a href="#/research" style="color:var(--muted)">← Research Hub</a><h1 id="rh-title">Loading…</h1></div></div><div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  try {
    const [a, saved] = await Promise.all([rhApi(`/articles/${id}`), rhApi('/saved').catch(() => ({ items: [] }))]);
    const isSaved = saved.items.some(s => s.articleId === a.id);
    document.getElementById('rh-title').textContent = a.title.slice(0, 90);
    let summary = null;
    try { summary = (await rhApi(`/articles/${id}/summary`)).summary; } catch { /* AI offline is non-fatal */ }
    body.innerHTML = `
      <div class="grid g2">
        <div>
          <div class="card">
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">
              <span class="chip neutral">${escRh(a.articleType)}</span>${evidenceChip(a.evidence)}
              ${a.preprint ? '<span class="chip warn">preprint</span>' : ''}
              ${a.highRisk && a.highRisk.length ? `<span class="chip danger">human review required: ${a.highRisk.join(', ')}</span>` : ''}
            </div>
            <div class="page-sub">${escRh(a.publisher || '')}${a.journal ? ` · ${escRh(a.journal)}` : ''}</div>
            <div class="page-sub">Published: ${fmtDate(a.publishedAt)} · Retrieved: ${fmtDate(a.retrievedAt)}${a.modifiedAt ? ` · Source updated: ${fmtDate(a.modifiedAt)}` : ''}</div>
            <div class="page-sub">Source: ${escRh(a.sourceId)}${a.pmid ? ` · PMID ${escRh(a.pmid)}` : ''}${a.doi ? ` · DOI ${escRh(a.doi)}` : ''}</div>
            ${a.authors && a.authors.length ? `<div class="page-sub mt">Authors: ${escRh(a.authors.slice(0, 8).join(', '))}${a.authors.length > 8 ? ' et al.' : ''}</div>` : ''}
            <div class="row mt" style="gap:8px">
              <button class="btn" data-save="${a.id}">${isSaved ? '★ Saved' : '☆ Save article'}</button>
              <a class="btn secondary" href="${escRh(a.url || '#')}" target="_blank" rel="noopener noreferrer">Open original source</a>
            </div>
          </div>
          <div class="card">
            <h2>Abstract</h2>
            <p style="font-size:13.5px;line-height:1.6">${escRh(a.abstract || 'No abstract available in the retrieved record.')}</p>
          </div>
        </div>
        <div class="card">
          <h2>AI Research Summary</h2>
          ${summary ? `
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">
              <span class="chip neutral">evidence: ${escRh(summary.evidenceStatus)}</span>
              <span class="chip neutral">${escRh(summary.provider)}</span>
            </div>
            ${[['In simple English', summary.simpleEnglish], ['Research question', summary.researchQuestion], ['Study type', summary.studyType],
               ['Key findings', (summary.keyFindings || []).map(x => `• ${escRh(x)}`).join('<br>')],
               ['Limitations', (summary.limitations || []).map(x => `• ${escRh(x)}`).join('<br>')],
               ['Practical relevance', summary.practicalRelevance], ['What remains unknown', summary.whatRemainsUnknown]]
              .map(([k, v]) => v ? `<div class="mb"><b style="font-size:12.5px">${k}</b><div style="font-size:12.5px;color:var(--muted-fg)">${v}</div></div>` : '').join('')}
            <div class="disclaimer">Educational summary only — not medical advice. Verify against the original source.</div>`
          : '<div class="empty">Summary unavailable right now. The summarizer may be offline; the source link remains available.</div>'}
        </div>
      </div>`;
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.onclick = async () => {
      try {
        if (isSaved) { await rhApi(`/saved/${a.id}`, { method: 'DELETE' }); saveBtn.textContent = '☆ Save article'; }
        else { await rhApi(`/saved/${a.id}`, { method: 'POST' }); saveBtn.textContent = '★ Saved'; }
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load article: ${escRh(e.message)}<br><br><a href="#/research">Back to Research Hub</a></div>`;
  }
};

/* ================= SAVED ARTICLES ================= */
VIEWS.researchSaved = async function (container) {
  container.innerHTML = `
    <div class="topbar"><div><h1>Saved Articles</h1><div class="page-sub">Your personal reading list.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a><a href="#/research/diseases">Disease &amp; Virus Watch</a>
      <a href="#/research/explorer">Paper Explorer</a><a href="#/research/saved" class="on">Saved Articles</a>
      <a href="#/research/preferences">My Interests</a>
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  try {
    const data = await rhApi('/saved');
    body.innerHTML = data.items.length
      ? `<div class="row" style="flex-direction:column;gap:12px">${data.items.map(s => articleCard(s.article)).join('')}</div>`
      : '<div class="empty">No saved articles yet. Browse research and tap “Save”.</div>';
    wireCards(body);
  } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load saved articles: ${escRh(e.message)}</div>`;
  }
};

/* ================= PREFERENCES ================= */
VIEWS.researchPrefs = async function (container) {
  const TOPICS = ['Diabetes', 'Cardiovascular health', 'Cancer research', 'Infectious diseases', 'Vaccines', 'Nutrition', 'Preventive medicine', 'Neurology', 'Public health', 'Mental wellness'];
  container.innerHTML = `
    <div class="topbar"><div><h1>My Research Interests</h1>
      <div class="page-sub">Choose topics to personalize your feed. Your interests are stored only with your account and are never sent to external AI providers.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a><a href="#/research/diseases">Disease &amp; Virus Watch</a>
      <a href="#/research/explorer">Paper Explorer</a><a href="#/research/saved">Saved Articles</a>
      <a href="#/research/preferences" class="on">My Interests</a>
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  try {
    const prefs = await rhApi('/preferences');
    body.innerHTML = `
      <div class="card mb">
        <h2>Followed topics</h2>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${TOPICS.map(t => `<label class="chip ${prefs.interests.includes(t) ? 'ok' : 'neutral'}" style="cursor:pointer;padding:8px 14px">
            <input type="checkbox" class="rh-interest" value="${escRh(t)}" ${prefs.interests.includes(t) ? 'checked' : ''} style="margin-right:6px">${escRh(t)}</label>`).join('')}
        </div>
      </div>
      <div class="card">
        <h2>Notifications</h2>
        <label style="display:block;margin-bottom:8px"><input type="checkbox" id="rh-n-alerts" ${prefs.notify.alerts ? 'checked' : ''}> High-priority official developments</label>
        <label style="display:block"><input type="checkbox" id="rh-n-digest" ${prefs.notify.digest ? 'checked' : ''}> Occasional research digest</label>
      </div>
      <button class="btn" id="rh-save-prefs">Save preferences</button>`;
    body.querySelector('#rh-save-prefs').onclick = async () => {
      const interests = [...body.querySelectorAll('.rh-interest:checked')].map(c => c.value);
      const notify = { alerts: body.querySelector('#rh-n-alerts').checked, digest: body.querySelector('#rh-n-digest').checked };
      try {
        await rhApi('/preferences', { method: 'PUT', body: JSON.stringify({ interests, notify }) });
        toast('Preferences saved.');
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load preferences: ${escRh(e.message)}</div>`;
  }
};

/* ================= ADMIN: SOURCES ================= */
VIEWS.researchAdminSources = async function (container) {
  if (!App.user?.isAdmin) { container.innerHTML = '<div class="card empty">Admin access required.</div>'; return; }
  container.innerHTML = `
    <div class="topbar"><div><h1>Research Source Management</h1><div class="page-sub">Configure and synchronize approved research sources.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a><a href="#/research/admin/sources" class="on">Source Management</a>
      <a href="#/research/admin/review">Content Review</a>
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  try {
    const data = await rhAdminApi('/sources');
    body.innerHTML = `
      <div class="card mb">
        <h2>Sources</h2>
        ${data.sources.map(s => `
          <div class="card" style="background:var(--secondary)">
            <div class="spread">
              <div>
                <b>${escRh(s.name)}</b> <span class="chip ${s.trustTier === 'official' ? 'ok' : 'warn'}">${escRh(s.trustTier)}</span>
                ${s.enabled ? '<span class="chip info">enabled</span>' : '<span class="chip neutral">disabled</span>'}
                ${s.lastSyncOk === false ? '<span class="chip danger">last sync failed</span>' : ''}
                <div class="page-sub">${escRh(s.connectorType)} · every ${s.intervalMin} min · rate-limit ${s.rateLimitMs}ms</div>
                <div class="page-sub">Last sync: ${s.lastSyncAt ? fmtDate(s.lastSyncAt) : 'never'} ${s.lastSyncOk === false ? '(failed)' : ''}</div>
                ${s.note ? `<div class="page-sub">${escRh(s.note)}</div>` : ''}
              </div>
              <div class="row">
                <button class="btn sm" data-sync="${s.id}" ${s.connectorType === 'manual' ? 'disabled title="Manual connector"' : ''}>Sync now</button>
                <button class="btn sm ${s.enabled ? 'danger-outline' : ''}" data-toggle="${s.id}">${s.enabled ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div class="card mb">
        <h2>Synchronization log</h2>
        <div id="rh-logs"><span class="spin"></span></div>
      </div>
      <div class="card">
        <h2>Add source</h2>
        <div class="grid g2">
          <div><label>Name</label><input id="rh-ns-name"></div>
          <div><label>Base URL</label><input id="rh-ns-url" placeholder="https://…"></div>
          <div><label>Connector type</label><select id="rh-ns-type"><option value="rest">REST</option><option value="rss">RSS</option><option value="manual">Manual (admin entry)</option></select></div>
          <div><label>Interval (min)</label><input id="rh-ns-interval" type="number" value="15" min="5"></div>
        </div>
        <button class="btn mt" id="rh-ns-add">Add source</button>
      </div>`;
    body.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Syncing…';
      try {
        const r = await rhAdminApi(`/sources/${b.dataset.sync}/sync`, { method: 'POST', body: '{}' });
        toast(r.ok ? `Sync complete: ${r.created} new, ${r.duplicates} duplicates` : `Sync failed: ${r.note || 'unknown error'}`);
        VIEWS.researchAdminSources(container);
      } catch (e) { toast(e.message, 'err'); }
    });
    body.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
      const s = data.sources.find(x => x.id === b.dataset.toggle);
      await rhAdminApi(`/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !s.enabled }) });
      VIEWS.researchAdminSources(container);
    });
    body.querySelector('#rh-ns-add').onclick = async () => {
      try {
        await rhAdminApi('/sources', { method: 'POST', body: JSON.stringify({ name: body.querySelector('#rh-ns-name').value, baseUrl: body.querySelector('#rh-ns-url').value, connectorType: body.querySelector('#rh-ns-type').value, intervalMin: Number(body.querySelector('#rh-ns-interval').value) || 15 }) });
        toast('Source added.'); VIEWS.researchAdminSources(container);
      } catch (e) { toast(e.message, 'err'); }
    };
    const logs = await rhAdminApi('/sync-logs');
    body.querySelector('#rh-logs').innerHTML = logs.logs.length
      ? `<table class="tbl"><thead><tr><th>Time</th><th>Source</th><th>OK</th><th>Detail</th></tr></thead><tbody>
          ${logs.logs.slice(0, 20).map(l => `<tr><td class="page-sub">${fmtDate(l.ts)}</td><td>${escRh(l.sourceId)}</td><td>${l.ok ? '✓' : '✗'}</td><td class="page-sub">${escRh(l.note || `+${l.created} new / ${l.duplicates} dupes`)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No sync attempts yet.</div>';
  } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load sources: ${escRh(e.message)}</div>`;
  }
};

/* ================= ADMIN: REVIEW ================= */
VIEWS.researchAdminReview = async function (container) {
  if (!App.user?.isAdmin) { container.innerHTML = '<div class="card empty">Admin access required.</div>'; return; }
  container.innerHTML = `
    <div class="topbar"><div><h1>Content Review</h1><div class="page-sub">High-risk content requires human approval before publication.</div></div></div>
    <div class="rh-tabs">
      <a href="#/research">Dashboard</a><a href="#/research/admin/sources" >Source Management</a>
      <a href="#/research/admin/review" class="on">Content Review</a>
    </div>
    <div id="rh-body"><span class="spin"></span></div>`;
  const body = container.querySelector('#rh-body');
  try {
    const data = await rhAdminApi('/reviews');
    body.innerHTML = data.items.length
      ? `<div class="row" style="flex-direction:column;gap:12px">${data.items.map(a => `
        <div class="card" style="border-left:4px solid var(--warn)">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="chip warn">${escRh(a.status)}</span>${evidenceChip(a.evidence)}
            ${a.highRisk && a.highRisk.length ? `<span class="chip danger">flags: ${a.highRisk.map(escRh).join(', ')}</span>` : ''}
          </div>
          <b style="display:block;margin:6px 0 2px">${escRh(a.title)}</b>
          <div class="page-sub">${escRh(a.publisher || '')} · ${fmtDate(a.publishedAt)}</div>
          <div class="page-sub" style="margin-top:4px">${escRh((a.abstract || '').slice(0, 300))}…</div>
          <div class="row mt" style="gap:8px">
            <button class="btn sm" data-review="approve" data-id="${a.id}">Approve &amp; publish</button>
            <button class="btn sm danger-outline" data-review="reject" data-id="${a.id}">Reject</button>
            <button class="btn sm secondary" data-review="retract" data-id="${a.id}">Retract</button>
            <a class="btn sm secondary" href="#/research/article/${a.id}">View</a>
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty">Nothing waiting for review. High-risk content is queued here automatically.</div>';
    body.querySelectorAll('[data-review]').forEach(b => b.onclick = async () => {
      const reason = b.dataset.review === 'reject' ? prompt('Reason for rejection (recorded in audit log):') || '' : '';
      try {
        await rhAdminApi(`/articles/${b.dataset.id}/${b.dataset.review}`, { method: 'POST', body: JSON.stringify({ reason }) });
        toast(`Article ${b.dataset.review}ed.`); VIEWS.researchAdminReview(container);
      } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) {
    body.innerHTML = `<div class="card empty">Failed to load review queue: ${escRh(e.message)}</div>`;
  }
};

/* ---------------- shared card wiring ---------------- */
function wireCards(root) {
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const id = b.dataset.save;
    try {
      const savedNow = !b.textContent.includes('Saved');
      if (savedNow) await rhApi(`/saved/${id}`, { method: 'POST' });
      else await rhApi(`/saved/${id}`, { method: 'DELETE' });
      b.textContent = savedNow ? '★ Saved' : '☆ Save';
      b.classList.toggle('secondary', !savedNow);
      toast(savedNow ? 'Article saved.' : 'Removed from saved.');
    } catch (e) { toast(e.message, 'err'); }
  });
}
