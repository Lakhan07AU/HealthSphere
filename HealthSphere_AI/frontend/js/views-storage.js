/* ---------- Storage manager — where your report files live ---------- */

const STORAGE_META = {
  supabase: { pill: '<span class="pill pill-info">Cloud bucket</span>', hint: 'Stored in your private Supabase Storage bucket. Survives redeploys and travels with you.' },
  cloudinary: { pill: '<span class="pill pill-info">Cloudinary cloud</span>', hint: 'Stored in your Cloudinary cloud with an unlisted URL. Survives redeploys; downloads stay gated behind your login.' },
  db: { pill: '<span class="pill pill-normal">In database</span>', hint: 'Small file embedded in the database record. Survives wherever your database survives.' },
  local: { pill: '<span class="pill pill-neutral">This server disk</span>', hint: 'Stored on this server\u2019s disk. Fast, but wiped on hosting redeploys.' },
  missing: { pill: '<span class="pill pill-critical">Missing</span>', hint: 'The record points to a file that is no longer on this server. Re-upload the report to restore it.' },
};

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

VIEWS.storage = async function (container) {
  container.innerHTML = '<div class="skel-load"><div class="skel" style="height:120px"></div><div class="skel" style="height:220px"></div></div>';
  let d;
  try { d = await api('/api/storage'); }
  catch (e) { container.innerHTML = `<div class="card empty">Could not load storage info: ${esc(e.message)}</div>`; return; }

  const files = d.files || [];
  container.innerHTML = `
    <div class="topbar"><div><h1>File storage</h1>
      <div class="page-sub">Every uploaded lab report and scan, with exactly where it lives.</div></div>
      <a class="btn secondary" href="#/reports">Back to reports</a></div>

    <div class="card mb">
      <div class="spread">
        <h2>Backend status</h2>
        ${d.cloudReady
          ? '<span class="pill pill-info"><span class="pill-dot" aria-hidden="true"></span>Cloud persistence on</span>'
          : '<span class="pill pill-neutral"><span class="pill-dot" aria-hidden="true"></span>Local mode</span>'}
      </div>
      <div class="row" style="gap:16px">
        <div><b style="font-family:var(--font-display);font-size:24px">${files.length}</b><div class="page-sub">files stored</div></div>
        <div><b style="font-family:var(--font-display);font-size:24px">${fmtBytes(d.usedBytes)}</b><div class="page-sub">total size</div></div>
      </div>
      <div class="page-sub mt" style="max-width:70ch">Files are kept in tiers: cloud (Supabase bucket or Cloudinary) when configured, database-embedded copies for small files, otherwise this server\u2019s disk.
      ${d.cloudReady ? '' : ' To survive hosting redeploys, set <b>SUPABASE_URL</b> + <b>SUPABASE_SERVICE_KEY</b>, or <b>CLOUDINARY_CLOUD_NAME</b> + <b>CLOUDINARY_API_KEY</b> + <b>CLOUDINARY_API_SECRET</b> (see README) — no code changes needed.'}</div>
    </div>

    <div class="card">
      <div class="spread"><h2>Stored files</h2><span class="page-sub">${files.length} item(s)</span></div>
      ${files.map(f => { const m = STORAGE_META[f.backend] || STORAGE_META.missing; return `
        <div class="tl-event" style="align-items:flex-start">
          <div class="initials" aria-hidden="true">${window.icon ? window.icon('file-text', 18) : 'F'}</div>
          <div style="flex:1;min-width:0">
            <div class="tl-title" style="overflow:hidden;text-overflow:ellipsis">${esc(f.filename)}</div>
            <div class="tl-detail">${fmtBytes(f.size)} · uploaded ${fmtDateUI(f.uploadedAt)}</div>
            <div class="row mt" style="gap:6px">${m.pill}</div>
            <div class="page-sub" style="font-size:11.5px">${m.hint}</div>
          </div>
          <div class="row" style="gap:6px;flex-shrink:0">
            ${f.backend === 'missing'
              ? '<span class="page-sub">re-upload needed</span>'
              : `<a class="btn sm secondary" href="/api/reports/${esc(f.id)}/file" target="_blank" rel="noopener">Download</a>`}
            <button class="btn sm danger-outline" data-stor-del="${esc(f.id)}">Delete</button>
          </div>
        </div>`; }).join('') || '<div class="empty">No stored files yet — upload a lab report and it will appear here.</div>'}
    </div>`;

  container.querySelectorAll('[data-stor-del]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Delete this file?', 'The report record and its stored file will be removed permanently.', 'Delete')) return;
    try { await api(`/api/reports/${b.dataset.storDel}`, { method: 'DELETE' }); toast('File deleted'); VIEWS.storage(container); }
    catch (e) { toast(e.message, 'err'); }
  });
};
