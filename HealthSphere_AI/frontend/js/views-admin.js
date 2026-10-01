/* ---------- Admin Control Center (ADMIN_EMAILS-gated) ---------- */

const ADMIN_LABEL = {
  familyMembers: 'Family', reports: 'Reports', metrics: 'Metrics', lifestyleLogs: 'Logs',
  doctors: 'Doctors', contacts: 'Contacts', reminders: 'Reminders', auditEvents: 'Audit'
};

VIEWS.admin = async function (container) {
  container.innerHTML = `
    <div class="topbar"><div><h1>Admin Control Center</h1>
      <div class="page-sub">Full oversight of users, doctors, stores, and system activity.</div></div></div>
    <div class="tabs" id="admin-tabs">
      <button class="tab active" data-tab="users">Users</button>
      <button class="tab" data-tab="doctors">Doctors</button>
      <button class="tab" data-tab="stores">Stores</button>
      <button class="tab" data-tab="tickets">Tickets</button>
      <button class="tab" data-tab="feedback">Feedback</button>
      <button class="tab" data-tab="system">System</button>
    </div>
    <div id="admin-tab-content"></div>
  `;

  const tabs = container.querySelector('#admin-tabs');
  const content = container.querySelector('#admin-tab-content');

  tabs.addEventListener('click', async e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    await loadTab(btn.dataset.tab);
  });

  await loadTab('users');

  async function loadTab(tab) {
    if (tab === 'users') await renderUsersTab(content);
    else if (tab === 'doctors') await renderDoctorsTab(content);
    else if (tab === 'stores') await renderStoresTab(content);
    else if (tab === 'tickets') await renderTicketsTab(content);
    else if (tab === 'feedback') await renderFeedbackTab(content);
    else if (tab === 'system') await renderSystemTab(content);
  }
};

/* ---- Users Tab ---- */
async function renderUsersTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let ul;
  try { ul = await api('/api/admin/users'); } catch { el.innerHTML = '<div class="card empty">Failed to load users.</div>'; return; }

  el.innerHTML = `
    <div class="card">
      <div class="spread"><h2>Users (${ul.users.length})</h2>
        <input id="adm-q" placeholder="Filter name / email…" style="width:190px"></div>
      <div style="overflow-x:auto">
        <table class="tbl" id="adm-tbl">
          <thead><tr><th>User</th><th>Data</th><th>Last login</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;

  const tbody = el.querySelector('#adm-tbl tbody');
  function renderRows(filter = '') {
    const q = filter.trim().toLowerCase();
    const rows = ul.users.filter(u => !q || (u.name + u.email).toLowerCase().includes(q));
    tbody.innerHTML = rows.map(u => `
      <tr>
        <td><b>${esc(u.name)}</b>${u.isAdmin ? ' <span class="chip info">admin</span>' : ''}<br>
            <span class="page-sub" style="font-size:12px">${esc(u.email)}</span><br>
            <span class="page-sub" style="font-size:11px">joined ${fmtDateUI(u.createdAt)}</span></td>
        <td class="num-cell" style="font-size:12px">${
          Object.entries(u.counts).filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${ADMIN_LABEL[k] || k}`).join('<br>') || '<span class="page-sub">empty</span>'
        }</td>
        <td style="font-size:12px">${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn sm danger-outline" data-del="${u.id}" ${u.id === App.user.id ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4"><div class="empty">No users match</div></td></tr>';
    tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const u = ul.users.find(x => x.id === b.dataset.del);
      if (!await confirmDlg('Delete user?', `This removes ${u?.email} and all data.`, 'Delete')) return;
      try { await api(`/api/admin/users/${b.dataset.del}`, { method: 'DELETE' }); toast('User deleted.'); renderUsersTab(el); }
      catch (e) { toast(e.message, 'err'); }
    });
  }
  renderRows();
  el.querySelector('#adm-q').oninput = e => renderRows(e.target.value);
}

/* ---- Doctors Tab ---- */
async function renderDoctorsTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let data;
  try { data = await api('/api/admin/doctors'); } catch { el.innerHTML = '<div class="card empty">Failed to load doctors.</div>'; return; }

  const docs = data.doctors || [];
  const pending = docs.filter(d => d.verificationStatus === 'pending');
  const verified = docs.filter(d => d.verificationStatus === 'verified');
  const others = docs.filter(d => !['pending', 'verified'].includes(d.verificationStatus));

  el.innerHTML = `
    <div class="grid g4 mb">
      <div class="card stat"><b>${docs.length}</b><span>Total Doctors</span></div>
      <div class="card stat"><b>${pending.length}</b><span>Pending Verification</span></div>
      <div class="card stat"><b>${verified.length}</b><span>Verified</span></div>
      <div class="card stat"><b>${docs.filter(d => d.availabilityStatus === 'online').length}</b><span>Currently Online</span></div>
    </div>

    ${pending.length > 0 ? `
    <div class="card mb">
      <h2>Pending Verification <span class="chip warn">${pending.length}</span></h2>
      ${pending.map(d => `
        <div class="doctor-verify-card">
          <div class="spread">
            <div>
              <b>${esc(d.name)}</b>
              <div class="page-sub" style="font-size:12px">${esc(d.email)}</div>
              <div style="font-size:12px;margin-top:4px">
                <span class="chip neutral">${esc(d.qualification)}</span>
                <span class="chip neutral">${esc(d.specialization)}</span>
                <span class="chip neutral">License: ${esc(d.licenseNumber)}</span>
                ${d.yearsExp ? `<span class="chip neutral">${d.yearsExp} yrs exp</span>` : ''}
                ${d.fee ? `<span class="chip neutral">₹${d.fee}</span>` : ''}
              </div>
              ${d.idProof ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:3px">ID Proof: ${esc(d.idProof)}</div>` : ''}
            </div>
            <div class="row">
              <button class="btn sm" data-doc-approve="${d.id}">Approve</button>
              <button class="btn sm danger-outline" data-doc-reject="${d.id}">Reject</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>` : ''}

    <div class="card">
      <h2>All Doctors (${docs.length})</h2>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Doctor</th><th>Specialization</th><th>Status</th><th>Availability</th><th></th></tr></thead>
          <tbody>
            ${docs.map(d => `
              <tr>
                <td><b>${esc(d.name)}</b><br><span class="page-sub" style="font-size:11px">${esc(d.email)}<br>${esc(d.qualification)}</span></td>
                <td><span class="chip neutral">${esc(d.specialization)}</span></td>
                <td><span class="chip ${d.verificationStatus === 'verified' ? 'ok' : d.verificationStatus === 'pending' ? 'warn' : 'bad'}">${esc(d.verificationStatus)}</span></td>
                <td><span class="chip ${d.availabilityStatus === 'online' ? 'ok' : 'neutral'}">${esc(d.availabilityStatus)}</span></td>
                <td style="white-space:nowrap">
                  ${d.verificationStatus !== 'verified' ? `<button class="btn sm" data-doc-approve="${d.id}">Approve</button>` : ''}
                  ${d.verificationStatus === 'verified' ? `<button class="btn sm danger-outline" data-doc-suspend="${d.id}">Suspend</button>` : ''}
                </td>
              </tr>`).join('') || '<tr><td colspan="5"><div class="empty">No doctors registered</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  el.querySelectorAll('[data-doc-approve]').forEach(b => b.onclick = async () => {
    try { await api(`/api/admin/doctors/${b.dataset.docApprove}/approve`, { method: 'POST' }); toast('Doctor approved.'); renderDoctorsTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
  el.querySelectorAll('[data-doc-reject]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Reject this doctor?', 'They will not be able to go online.', 'Reject')) return;
    try { await api(`/api/admin/doctors/${b.dataset.docReject}/reject`, { method: 'POST', body: { reason: 'Credentials not verified' } }); toast('Doctor rejected.'); renderDoctorsTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
  el.querySelectorAll('[data-doc-suspend]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Suspend this doctor?', 'They will be taken offline immediately.', 'Suspend')) return;
    try { await api(`/api/admin/doctors/${b.dataset.docSuspend}/suspend`, { method: 'POST' }); toast('Doctor suspended.'); renderDoctorsTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
}

/* ---- Stores Tab ---- */
async function renderStoresTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let data;
  try { data = await api('/api/admin/stores'); } catch { el.innerHTML = '<div class="card empty">Failed to load stores.</div>'; return; }

  const stores = data.stores || [];
  const owners = data.owners || [];
  const pending = stores.filter(s => s.status === 'pending');
  const approved = stores.filter(s => s.status === 'approved');

  el.innerHTML = `
    <div class="grid g4 mb">
      <div class="card stat"><b>${stores.length}</b><span>Total Stores</span></div>
      <div class="card stat"><b>${pending.length}</b><span>Pending Approval</span></div>
      <div class="card stat"><b>${approved.length}</b><span>Live</span></div>
      <div class="card stat"><b>${stores.reduce((s, x) => s + (x.views || 0), 0)}</b><span>Total Views</span></div>
    </div>

    ${pending.length > 0 ? `
    <div class="card mb">
      <h2>Pending Store Approval <span class="chip warn">${pending.length}</span></h2>
      ${pending.map(s => {
        const owner = owners.find(o => o.id === s.ownerId);
        return `
          <div class="doctor-verify-card">
            <div class="spread">
              <div>
                <b>${esc(s.name)}</b>
                <div class="page-sub" style="font-size:12px">${esc(s.category)} · ${esc(s.address)}</div>
                <div style="font-size:11px;color:var(--ink-faint);margin-top:3px">
                  Owner: ${owner ? esc(owner.ownerName) + ' (' + esc(owner.email) + ')' : '—'}
                  ${owner ? ' · License: ' + esc(owner.licenseNumber) : ''}
                </div>
              </div>
              <div class="row">
                <button class="btn sm" data-store-approve="${s.id}">Approve</button>
                <button class="btn sm danger-outline" data-store-reject="${s.id}">Reject</button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>` : ''}

    <div class="card">
      <h2>All Stores (${stores.length})</h2>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Store</th><th>Category</th><th>Status</th><th>Views</th><th>Clicks</th><th></th></tr></thead>
          <tbody>
            ${stores.map(s => `
              <tr>
                <td><b>${esc(s.name)}</b><br><span class="page-sub" style="font-size:11px">${esc(s.address)}</span></td>
                <td><span class="chip neutral">${esc(s.category)}</span></td>
                <td><span class="chip ${s.status === 'approved' ? 'ok' : s.status === 'pending' ? 'warn' : 'bad'}">${esc(s.status)}</span></td>
                <td class="num-cell">${s.views || 0}</td>
                <td class="num-cell">${s.clicks || 0}</td>
                <td style="white-space:nowrap">
                  ${s.status !== 'approved' ? `<button class="btn sm" data-store-approve="${s.id}">Approve</button>` : ''}
                  ${s.status === 'approved' ? `<button class="btn sm danger-outline" data-store-suspend="${s.id}">Suspend</button>` : ''}
                </td>
              </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No stores registered</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  el.querySelectorAll('[data-store-approve]').forEach(b => b.onclick = async () => {
    try { await api(`/api/admin/stores/${b.dataset.storeApprove}/approve`, { method: 'POST' }); toast('Store approved.'); renderStoresTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
  el.querySelectorAll('[data-store-reject]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Reject this store?', 'The store listing will not go live.', 'Reject')) return;
    try { await api(`/api/admin/stores/${b.dataset.storeReject}/reject`, { method: 'POST', body: { reason: 'Listing does not meet requirements' } }); toast('Store rejected.'); renderStoresTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
  el.querySelectorAll('[data-store-suspend]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Suspend this store?', 'The listing will be taken down.', 'Suspend')) return;
    try { await api(`/api/admin/stores/${b.dataset.storeSuspend}/suspend`, { method: 'POST' }); toast('Store suspended.'); renderStoresTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
}

/* ---- Tickets Tab ---- */
async function renderTicketsTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let [ticketData, apptData] = await Promise.all([
    api('/api/admin/tickets').catch(() => ({ tickets: [] })),
    api('/api/admin/appointments').catch(() => ({ appointments: [] }))
  ]);

  const tickets = ticketData.tickets || [];
  const appts = apptData.appointments || [];

  el.innerHTML = `
    <div class="grid g2 mb">
      <div class="card stat"><b>${tickets.length}</b><span>Total Tickets</span></div>
      <div class="card stat"><b>${appts.length}</b><span>Total Appointments</span></div>
    </div>

    <div class="card mb">
      <h2>Recent Consultation Tickets</h2>
      ${tickets.length === 0 ? '<div class="empty" style="margin-top:12px">No tickets yet</div>' : `
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Patient</th><th>Specialization</th><th>Symptoms</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            ${tickets.map(t => `
              <tr>
                <td>${esc(t.patientName)}</td>
                <td><span class="chip neutral">${esc(t.specialization)}</span></td>
                <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(t.symptoms || '—')}</td>
                <td><span class="chip ${t.status === 'accepted' ? 'ok' : t.status === 'pending' ? 'warn' : 'neutral'}">${esc(t.status)}</span></td>
                <td style="font-size:12px">${new Date(t.createdAt).toLocaleString()}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <h2>Appointments</h2>
      ${appts.length === 0 ? '<div class="empty" style="margin-top:12px">No appointments yet</div>' : `
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Doctor</th><th>Patient</th><th>Slot</th><th>Status</th></tr></thead>
          <tbody>
            ${appts.map(a => `
              <tr>
                <td>${esc(a.doctorName)}</td>
                <td>${esc(a.patientName)}</td>
                <td style="font-size:12px">${new Date(a.confirmedSlot).toLocaleString()}</td>
                <td><span class="chip ${a.status === 'confirmed' ? 'ok' : 'neutral'}">${esc(a.status)}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
}

/* ---- Feedback Tab ---- */
async function renderFeedbackTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let d;
  try { d = await api('/api/admin/feedback'); }
  catch { el.innerHTML = '<div class="card empty">Failed to load feedback.</div>'; return; }
  const items = d.feedback || [];
  const badge = t => ({ bug: '<span class="pill pill-critical">Bug</span>', idea: '<span class="pill pill-info">Idea</span>', praise: '<span class="pill pill-normal">Praise</span>' }[t] || '');
  el.innerHTML = `
    <div class="card">
      <div class="spread"><h2>User feedback (${items.length})</h2></div>
      ${items.map(f => `
        <div class="fb-item">
          <div class="spread"><div>${badge(f.type)} <b style="font-size:13px">${esc(f.userEmail || '?')}</b></div>
            <button class="btn sm secondary" data-fb-del="${esc(f.id)}">Resolve</button></div>
          <div style="font-size:13px;margin-top:6px;white-space:pre-wrap">${esc(f.message)}</div>
          <div class="fb-meta">${new Date(f.ts).toLocaleString()}${f.page ? ` · ${esc(f.page)}` : ''}</div>
        </div>`).join('') || '<div class="empty">No feedback yet — it will appear here when users write in.</div>'}
    </div>`;
  el.querySelectorAll('[data-fb-del]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Resolve feedback?', 'Remove this item from the queue?', 'Resolve')) return;
    try { await api(`/api/admin/feedback/${b.dataset.fbDel}`, { method: 'DELETE' }); toast('Resolved'); renderFeedbackTab(el); }
    catch (e) { toast(e.message, 'err'); }
  });
}

/* ---- System Tab ---- */
async function renderSystemTab(el) {
  el.innerHTML = '<div class="skel-load"><div class="skel" style="height:200px"></div></div>';
  let [ov, au] = await Promise.all([
    api('/api/admin/overview').catch(() => null),
    api('/api/admin/audit').catch(() => ({ audit: [], totalTracked: 0 }))
  ]);
  if (!ov) { el.innerHTML = '<div class="card empty">System data unavailable.</div>'; return; }

  const s = ov.stats;
  el.innerHTML = `
    <div class="grid g4 mb">
      <div class="card stat"><b>${s.users}</b><span>Users</span></div>
      <div class="card stat"><b>${s.activeSessions}</b><span>Active Sessions</span></div>
      <div class="card stat"><b>${s.reports}</b><span>Reports</span></div>
      <div class="card stat"><b>${s.auditEvents}</b><span>Audit Events</span></div>
    </div>

    <div class="card mb">
      <h2>System</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="chip ${ov.storage.mode === 'postgres' ? 'ok' : 'neutral'}">${ov.storage.mode === 'postgres' ? 'Supabase Postgres' : 'Local JSON file'}</span>
        <span class="chip ${ov.storage.fileStorage === 'supabase' ? 'ok' : 'neutral'}" title="Where uploaded report files live">${ov.storage.fileStorage === 'supabase' ? 'Supabase Storage files' : 'Local disk files'}</span>
        <span class="chip info">Node ${esc(ov.runtime.node)}</span>
        <span class="chip neutral">Uptime ${Math.floor(ov.runtime.uptimeSec / 60)}m ${ov.runtime.uptimeSec % 60}s</span>
      </div>
    </div>

    <div class="card">
      <h2>Global Activity Feed <span class="chip neutral">${au.totalTracked} events</span></h2>
      <div style="max-height:520px;overflow-y:auto;font-size:12.5px">
        ${au.audit.map(a => `
          <div class="tl-event" style="padding:6px 0">
            <div><b>${esc(a.action)}</b>${a.detail ? ` · ${esc(a.detail)}` : ''}
              <div class="tl-date">${esc(a.userEmail || '?')} · ${new Date(a.ts).toLocaleString()}</div></div>
          </div>`).join('') || '<div class="empty">No activity yet</div>'}
      </div>
    </div>`;
}
