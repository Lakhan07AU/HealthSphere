/* ---------- Admin Control Center — dedicated sidebar portal ---------- */

const ADMIN_LABEL = {
  familyMembers: 'Family', reports: 'Reports', metrics: 'Metrics', lifestyleLogs: 'Logs',
  doctors: 'Doctors', contacts: 'Contacts', reminders: 'Reminders', auditEvents: 'Audit'
};

const verifChip = s => ({
  verified: '<span class="chip ok">Verified</span>',
  pending: '<span class="chip warn">Pending</span>',
  rejected: '<span class="chip bad">Rejected</span>',
  suspended: '<span class="chip bad">Suspended</span>'
}[s] || `<span class="chip neutral">${esc(s)}</span>`);

const storeChip = s => ({
  approved: '<span class="chip ok">Live</span>',
  pending: '<span class="chip warn">Pending</span>',
  rejected: '<span class="chip bad">Rejected</span>',
  suspended: '<span class="chip bad">Suspended</span>'
}[s] || `<span class="chip neutral">${esc(s)}</span>`);

const ticketChip = s => ({
  accepted: '<span class="chip ok">Accepted</span>',
  pending: '<span class="chip warn">Pending</span>',
  rejected: '<span class="chip bad">Rejected</span>',
  expired: '<span class="chip neutral">Expired</span>'
}[s] || `<span class="chip neutral">${esc(s)}</span>`);

function reasonModal(title, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    const m = openModal(`
      <h2>${esc(title)}</h2>
      <label>Reason</label>
      <textarea id="rm-input" rows="3" placeholder="Enter reason…"></textarea>
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn secondary" id="rm-cancel">Cancel</button>
        <button class="btn danger" id="rm-ok">${esc(confirmLabel)}</button>
      </div>`);
    m.el.querySelector('#rm-cancel').onclick = () => { m.close(); resolve(null); };
    m.el.querySelector('#rm-ok').onclick = () => {
      const v = m.el.querySelector('#rm-input').value.trim();
      m.close();
      resolve(v || 'No reason provided');
    };
  });
}

function adminTopbar(title, sub) {
  return `<div class="topbar"><div><h1>${esc(title)}</h1>
    <div class="page-sub">${esc(sub)}</div></div></div>`;
}

function skelBox() {
  return '<div class="skel-load"><div class="skel" style="height:64px"></div><div class="grid g4"><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div></div><div class="skel" style="height:220px"></div></div>';
}

/* ==================== OVERVIEW ==================== */
VIEWS['admin-overview'] = async function (c) {
  c.innerHTML = skelBox();
  let [stats, audit] = await Promise.all([
    api('/api/admin/stats').catch(() => null),
    api('/api/admin/audit').catch(() => ({ audit: [] }))
  ]);
  if (!stats) { c.innerHTML = adminTopbar('Platform Overview', '') + '<div class="card empty">Failed to load platform stats.</div>'; return; }

  c.innerHTML = adminTopbar('Platform Overview', 'HealthSphere platform health and activity at a glance.') + `
    <div class="grid g4 mb">
      <div class="card stat"><b data-n="${stats.users}">0</b><span>Total Users</span>${stats.newUsersToday ? `<small class="stat-sub">+${stats.newUsersToday} today</small>` : ''}</div>
      <div class="card stat"><b data-n="${stats.activeSessions}">0</b><span>Active Sessions</span></div>
      <div class="card stat"><b data-n="${stats.doctors}">0</b><span>Doctors</span>${stats.doctorsPending ? `<small class="stat-sub warn-text">${stats.doctorsPending} pending</small>` : ''}</div>
      <div class="card stat"><b data-n="${stats.stores}">0</b><span>Stores</span>${stats.storesPending ? `<small class="stat-sub warn-text">${stats.storesPending} pending</small>` : ''}</div>
    </div>
    <div class="grid g4 mb">
      <div class="card stat"><b data-n="${stats.totalTickets}">0</b><span>Tickets</span></div>
      <div class="card stat"><b data-n="${stats.totalAppointments}">0</b><span>Appointments</span></div>
      <div class="card stat"><b data-n="${stats.openFeedback}">0</b><span>Open Feedback</span></div>
      <div class="card stat"><b data-n="${stats.totalReports}">0</b><span>Health Reports</span></div>
    </div>
    ${(stats.doctorsPending || stats.storesPending || stats.openFeedback) ? `
    <div class="card mb adm-action-card">
      <h2>Needs Attention</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${stats.doctorsPending ? `<button class="btn sm" data-h="#/admin/doctors">${stats.doctorsPending} doctor(s) awaiting verification →</button>` : ''}
        ${stats.storesPending ? `<button class="btn sm" data-h="#/admin/stores">${stats.storesPending} store(s) awaiting approval →</button>` : ''}
        ${stats.openFeedback ? `<button class="btn sm" data-h="#/admin/feedback">${stats.openFeedback} open feedback →</button>` : ''}
      </div>
    </div>` : ''}
    ${stats.recentLogins?.length ? `
    <div class="card mb">
      <h2>Recent Logins</h2>
      ${stats.recentLogins.map(l => `
        <div class="tl-event" style="padding:5px 0">
          <b>${esc(l.email)}</b> · <span class="tl-date">${new Date(l.ts).toLocaleString()}</span>
        </div>`).join('')}
    </div>` : ''}
    <div class="card">
      <h2>Recent Activity</h2>
      <div style="max-height:400px;overflow-y:auto;font-size:12.5px">
        ${(audit.audit || []).slice(0, 30).map(a => `
          <div class="tl-event" style="padding:5px 0">
            <b>${esc(a.action)}</b>${a.detail ? ` · ${esc(a.detail)}` : ''}
            <div class="tl-date">${esc(a.userEmail || '?')} · ${new Date(a.ts).toLocaleString()}</div>
          </div>`).join('') || '<div class="empty">No activity yet</div>'}
      </div>
    </div>`;

  c.querySelectorAll('[data-n]').forEach(el => animateNum(el, Number(el.dataset.n)));
};

/* ==================== USERS ==================== */
VIEWS['admin-users'] = async function (c) {
  c.innerHTML = skelBox();
  let ul;
  try { ul = await api('/api/admin/users'); } catch { c.innerHTML = adminTopbar('User Management', '') + '<div class="card empty">Failed to load users.</div>'; return; }

  c.innerHTML = adminTopbar('User Management', 'View, inspect, and manage patient accounts.') + `
    <div class="card">
      <div class="spread"><h2>Users (${ul.users.length})</h2>
        <input id="adm-q" placeholder="Filter name / email…" style="width:200px"></div>
      <div style="overflow-x:auto">
        <table class="tbl" id="adm-tbl">
          <thead><tr><th>User</th><th>Data</th><th>Last login</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;

  const tbody = c.querySelector('#adm-tbl tbody');
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
          <button class="btn sm secondary" data-view="${u.id}">View</button>
          <button class="btn sm danger-outline" data-del="${u.id}" ${u.id === App.user.id ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4"><div class="empty">No users match</div></td></tr>';

    tbody.querySelectorAll('[data-view]').forEach(b => b.onclick = () => adminUserDetail(b.dataset.view, c));
    tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const u = ul.users.find(x => x.id === b.dataset.del);
      if (!await confirmDlg('Delete user?', `This removes ${u?.email} and all data.`, 'Delete')) return;
      try { await api(`/api/admin/users/${b.dataset.del}`, { method: 'DELETE' }); toast('User deleted.'); VIEWS['admin-users'](c); }
      catch (e) { toast(e.message, 'err'); }
    });
  }
  renderRows();
  c.querySelector('#adm-q').oninput = e => renderRows(e.target.value);
};

async function adminUserDetail(id, container) {
  let d;
  try { d = await api(`/api/admin/users/${id}`); } catch (e) { toast(e.message, 'err'); return; }

  const p = d.profile || {};
  const counts = d.counts || {};
  const metrics = (d.metrics || []).slice(-10).reverse();
  const reports = (d.reports || []).slice(0, 5);
  const audit = (d.audit || []).slice(0, 20);

  const m = openModal(`
    <h2>${esc(d.user.name)} ${d.user.isAdmin ? '<span class="chip info">admin</span>' : ''}</h2>
    <p class="page-sub">${esc(d.user.email)} · joined ${fmtDateUI(d.user.createdAt)}</p>

    <div class="grid g4 mt mb">
      ${Object.entries(counts).filter(([, n]) => n > 0).slice(0, 8).map(([k, n]) => `
        <div class="card stat"><b>${n}</b><span>${ADMIN_LABEL[k] || k}</span></div>`).join('') || '<div class="empty" style="grid-column:1/-1">No data yet</div>'}
    </div>

    ${p.dob || p.sex ? `
    <h3 class="mt mb">Profile</h3>
    <div class="row" style="gap:6px;flex-wrap:wrap;font-size:13px">
      ${p.dob ? `<span class="chip neutral">DOB: ${esc(p.dob)}</span>` : ''}
      ${p.sex ? `<span class="chip neutral">${esc(p.sex)}</span>` : ''}
      ${p.heightCm ? `<span class="chip neutral">${p.heightCm} cm</span>` : ''}
      ${p.weightKg ? `<span class="chip neutral">${p.weightKg} kg</span>` : ''}
      ${p.bloodGroup ? `<span class="chip neutral">BG: ${esc(p.bloodGroup)}</span>` : ''}
      ${(p.allergies || []).map(a => `<span class="chip bad">${esc(a)}</span>`).join('')}
      ${(p.conditions || []).map(a => `<span class="chip warn">${esc(a)}</span>`).join('')}
    </div>` : ''}

    ${metrics.length ? `
    <h3 class="mt mb">Recent Metrics</h3>
    <div style="font-size:12.5px">
      ${metrics.map(m => `<div class="tl-event" style="padding:3px 0">${esc(m.key)}: <b>${m.value} ${esc(m.unit || '')}</b> · ${fmtDateUI(m.date)}</div>`).join('')}
    </div>` : ''}

    ${reports.length ? `
    <h3 class="mt mb">Recent Reports</h3>
    <div style="font-size:12.5px">
      ${reports.map(r => `<div class="tl-event" style="padding:3px 0">${esc(r.filename)} · ${esc(r.status)} · ${fmtDateUI(r.uploadedAt)}</div>`).join('')}
    </div>` : ''}

    ${audit.length ? `
    <h3 class="mt mb">Audit Trail</h3>
    <div style="max-height:200px;overflow-y:auto;font-size:12px">
      ${audit.map(a => `<div class="tl-event" style="padding:3px 0"><b>${esc(a.action)}</b>${a.detail ? ` · ${esc(a.detail)}` : ''} <span class="tl-date">${new Date(a.ts).toLocaleString()}</span></div>`).join('')}
    </div>` : ''}

    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="ud-close">Close</button>
      ${d.user.id !== App.user.id ? `<button class="btn danger" id="ud-del">Delete User</button>` : ''}
    </div>`, { wide: true, label: 'User detail' });

  m.el.querySelector('#ud-close').onclick = () => m.close();
  const delBtn = m.el.querySelector('#ud-del');
  if (delBtn) delBtn.onclick = async () => {
    if (!await confirmDlg('Delete user?', `This removes ${d.user.email} and all data.`, 'Delete')) return;
    try { await api(`/api/admin/users/${id}`, { method: 'DELETE' }); m.close(); toast('User deleted.'); VIEWS['admin-users'](container); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ==================== DOCTORS ==================== */
VIEWS['admin-doctors'] = async function (c) {
  c.innerHTML = skelBox();
  let data;
  try { data = await api('/api/admin/doctors'); } catch { c.innerHTML = adminTopbar('Doctor Management', '') + '<div class="card empty">Failed to load doctors.</div>'; return; }

  const docs = data.doctors || [];
  const pending = docs.filter(d => d.verificationStatus === 'pending');
  const verified = docs.filter(d => d.verificationStatus === 'verified');
  const online = docs.filter(d => d.availabilityStatus === 'online' && d.verificationStatus === 'verified');

  c.innerHTML = adminTopbar('Doctor Management', 'Verify credentials, manage availability, and oversee consultations.') + `
    <div class="grid g4 mb">
      <div class="card stat"><b data-n="${docs.length}">0</b><span>Total Doctors</span></div>
      <div class="card stat"><b data-n="${pending.length}">0</b><span>Pending Verification</span></div>
      <div class="card stat"><b data-n="${verified.length}">0</b><span>Verified</span></div>
      <div class="card stat"><b data-n="${online.length}">0</b><span>Currently Online</span></div>
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
                ${d.yearsExp ? `<span class="chip neutral">${d.yearsExp} yrs</span>` : ''}
                ${d.fee ? `<span class="chip neutral">₹${d.fee}</span>` : ''}
              </div>
              ${d.idProof ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:3px">ID: ${esc(d.idProof)}</div>` : ''}
            </div>
            <div class="row">
              <button class="btn sm secondary" data-view="${d.id}">Details</button>
              <button class="btn sm" data-approve="${d.id}">Approve</button>
              <button class="btn sm danger-outline" data-reject="${d.id}">Reject</button>
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
                <td>${verifChip(d.verificationStatus)}</td>
                <td>${d.verificationStatus === 'verified' ? `<span class="chip ${d.availabilityStatus === 'online' ? 'ok' : 'neutral'}">${esc(d.availabilityStatus)}</span>` : '<span class="page-sub">—</span>'}</td>
                <td style="white-space:nowrap">
                  <button class="btn sm secondary" data-view="${d.id}">View</button>
                  ${d.verificationStatus !== 'verified' && d.verificationStatus !== 'pending' ? `<button class="btn sm" data-reactivate="${d.id}">Restore</button>` : ''}
                  ${d.verificationStatus === 'pending' ? `<button class="btn sm" data-approve="${d.id}">Approve</button>` : ''}
                  ${d.verificationStatus === 'verified' ? `<button class="btn sm danger-outline" data-suspend="${d.id}">Suspend</button>` : ''}
                </td>
              </tr>`).join('') || '<tr><td colspan="5"><div class="empty">No doctors registered</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  c.querySelectorAll('[data-n]').forEach(el => animateNum(el, Number(el.dataset.n)));
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => adminDoctorDetail(b.dataset.view, c));
  c.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    try { await api(`/api/admin/doctors/${b.dataset.approve}/approve`, { method: 'POST' }); toast('Doctor approved.'); VIEWS['admin-doctors'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    const reason = await reasonModal('Reject this doctor?', 'Reject');
    if (reason === null) return;
    try { await api(`/api/admin/doctors/${b.dataset.reject}/reject`, { method: 'POST', body: { reason } }); toast('Doctor rejected.'); VIEWS['admin-doctors'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Suspend this doctor?', 'They will be taken offline immediately.', 'Suspend')) return;
    try { await api(`/api/admin/doctors/${b.dataset.suspend}/suspend`, { method: 'POST' }); toast('Doctor suspended.'); VIEWS['admin-doctors'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-reactivate]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Reactivate this doctor?', 'They will be restored to verified status.', 'Reactivate')) return;
    try { await api(`/api/admin/doctors/${b.dataset.reactivate}/reactivate`, { method: 'POST' }); toast('Doctor reactivated.'); VIEWS['admin-doctors'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
};

async function adminDoctorDetail(id, container) {
  let d;
  try { d = await api(`/api/admin/doctors/${id}/detail`); } catch (e) { toast(e.message, 'err'); return; }
  const doc = d.doctor;
  const appts = d.appointments || [];
  const tix = d.tickets || [];

  const m = openModal(`
    <h2>${esc(doc.name)} ${verifChip(doc.verificationStatus)}</h2>
    <p class="page-sub">${esc(doc.email)} · ${esc(doc.qualification)} · ${esc(doc.specialization)}</p>

    <div class="grid g4 mt mb">
      <div class="card stat"><b>${esc(doc.licenseNumber || '—')}</b><span>License</span></div>
      <div class="card stat"><b>${doc.yearsExp || '—'}</b><span>Years Exp</span></div>
      <div class="card stat"><b>${doc.fee ? '₹' + doc.fee : '—'}</b><span>Fee</span></div>
      <div class="card stat"><b>${d.activeSessions || 0}</b><span>Active Sessions</span></div>
    </div>

    ${doc.idProof ? `<p style="font-size:12px"><b>ID Proof:</b> ${esc(doc.idProof)}</p>` : ''}
    ${doc.rejectionReason ? `<p style="font-size:12px;color:var(--destructive)"><b>Rejection reason:</b> ${esc(doc.rejectionReason)}</p>` : ''}
    <p style="font-size:12px"><b>Registered:</b> ${new Date(doc.createdAt).toLocaleString()}</p>

    ${appts.length ? `
    <h3 class="mt mb">Appointments (${appts.length})</h3>
    <div style="max-height:180px;overflow-y:auto;font-size:12.5px">
      ${appts.map(a => `
        <div class="tl-event" style="padding:4px 0">
          <b>${esc(a.patientName)}</b> · ${new Date(a.confirmedSlot).toLocaleString()} · <span class="chip ${a.status === 'confirmed' ? 'ok' : 'neutral'}">${esc(a.status)}</span>
        </div>`).join('')}
    </div>` : ''}

    ${tix.length ? `
    <h3 class="mt mb">Assigned Tickets (${tix.length})</h3>
    <div style="max-height:150px;overflow-y:auto;font-size:12.5px">
      ${tix.map(t => `
        <div class="tl-event" style="padding:4px 0">
          ${esc(t.specialization)} — ${esc(t.symptoms || '')} · ${ticketChip(t.status)}
        </div>`).join('')}
    </div>` : ''}

    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="dd-close">Close</button>
    </div>`, { wide: true, label: 'Doctor detail' });

  m.el.querySelector('#dd-close').onclick = () => m.close();
}

/* ==================== STORES ==================== */
VIEWS['admin-stores'] = async function (c) {
  c.innerHTML = skelBox();
  let data;
  try { data = await api('/api/admin/stores'); } catch { c.innerHTML = adminTopbar('Store Management', '') + '<div class="card empty">Failed to load stores.</div>'; return; }

  const stores = data.stores || [];
  const owners = data.owners || [];
  const pending = stores.filter(s => s.status === 'pending');
  const approved = stores.filter(s => s.status === 'approved');

  c.innerHTML = adminTopbar('Store Management', 'Approve pharmacy listings, manage inventory visibility, and oversee store owners.') + `
    <div class="grid g4 mb">
      <div class="card stat"><b data-n="${stores.length}">0</b><span>Total Stores</span></div>
      <div class="card stat"><b data-n="${pending.length}">0</b><span>Pending Approval</span></div>
      <div class="card stat"><b data-n="${approved.length}">0</b><span>Live</span></div>
      <div class="card stat"><b data-n="${stores.reduce((s, x) => s + (x.views || 0), 0)}">0</b><span>Total Views</span></div>
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
                <button class="btn sm secondary" data-view="${s.id}">Details</button>
                <button class="btn sm" data-approve="${s.id}">Approve</button>
                <button class="btn sm danger-outline" data-reject="${s.id}">Reject</button>
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
                <td>${storeChip(s.status)}</td>
                <td class="num-cell">${s.views || 0}</td>
                <td class="num-cell">${s.clicks || 0}</td>
                <td style="white-space:nowrap">
                  <button class="btn sm secondary" data-view="${s.id}">View</button>
                  ${s.status !== 'approved' && s.status !== 'pending' ? `<button class="btn sm" data-reactivate="${s.id}">Restore</button>` : ''}
                  ${s.status === 'pending' ? `<button class="btn sm" data-approve="${s.id}">Approve</button>` : ''}
                  ${s.status === 'approved' ? `<button class="btn sm danger-outline" data-suspend="${s.id}">Suspend</button>` : ''}
                </td>
              </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No stores registered</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  c.querySelectorAll('[data-n]').forEach(el => animateNum(el, Number(el.dataset.n)));
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => adminStoreDetail(b.dataset.view, c));
  c.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    try { await api(`/api/admin/stores/${b.dataset.approve}/approve`, { method: 'POST' }); toast('Store approved.'); VIEWS['admin-stores'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    const reason = await reasonModal('Reject this store?', 'Reject');
    if (reason === null) return;
    try { await api(`/api/admin/stores/${b.dataset.reject}/reject`, { method: 'POST', body: { reason } }); toast('Store rejected.'); VIEWS['admin-stores'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Suspend this store?', 'The listing will be taken down.', 'Suspend')) return;
    try { await api(`/api/admin/stores/${b.dataset.suspend}/suspend`, { method: 'POST' }); toast('Store suspended.'); VIEWS['admin-stores'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
  c.querySelectorAll('[data-reactivate]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Reactivate this store?', 'The listing will go live again.', 'Reactivate')) return;
    try { await api(`/api/admin/stores/${b.dataset.reactivate}/reactivate`, { method: 'POST' }); toast('Store reactivated.'); VIEWS['admin-stores'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
};

async function adminStoreDetail(id, container) {
  let d;
  try { d = await api(`/api/admin/stores/${id}`); } catch (e) { toast(e.message, 'err'); return; }
  const s = d.store;
  const owner = d.owner;
  const products = s.products || [];
  const offers = s.offers || [];

  const m = openModal(`
    <h2>${esc(s.name)} ${storeChip(s.status)}</h2>
    <p class="page-sub">${esc(s.category)} · ${esc(s.address)}</p>

    <div class="grid g4 mt mb">
      <div class="card stat"><b>${s.views || 0}</b><span>Views</span></div>
      <div class="card stat"><b>${s.clicks || 0}</b><span>Clicks</span></div>
      <div class="card stat"><b>${d.productCount || 0}</b><span>Products</span></div>
      <div class="card stat"><b>${d.offerCount || 0}</b><span>Offers</span></div>
    </div>

    ${owner ? `
    <h3 class="mt mb">Owner</h3>
    <p style="font-size:13px"><b>${esc(owner.ownerName)}</b> · ${esc(owner.email)} · License: ${esc(owner.licenseNumber)}</p>
    ${owner.rejectionReason ? `<p style="font-size:12px;color:var(--destructive)"><b>Rejection reason:</b> ${esc(owner.rejectionReason)}</p>` : ''}
    ` : ''}

    ${s.contact ? `<p style="font-size:12px"><b>Contact:</b> ${esc(s.contact)}</p>` : ''}
    ${s.hours ? `<p style="font-size:12px"><b>Hours:</b> ${esc(s.hours)}</p>` : ''}

    ${offers.length ? `
    <h3 class="mt mb">Offers (${offers.length})</h3>
    <div style="max-height:120px;overflow-y:auto;font-size:12.5px">
      ${offers.map(o => `<div class="tl-event" style="padding:3px 0"><b>${esc(o.title || o.name || 'Offer')}</b>${o.discount ? ' — ' + esc(o.discount) : ''}</div>`).join('')}
    </div>` : ''}

    ${products.length ? `
    <h3 class="mt mb">Products (${products.length})</h3>
    <div style="max-height:180px;overflow-y:auto;font-size:12.5px">
      <table class="tbl">
        <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Rx</th></tr></thead>
        <tbody>
          ${products.slice(0, 20).map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td>₹${p.price}${p.mrp && p.mrp > p.price ? ` <span class="page-sub" style="text-decoration:line-through">₹${p.mrp}</span>` : ''}</td>
              <td>${p.stock}</td>
              <td>${p.requiresPrescription ? '<span class="chip warn">Rx</span>' : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="sd-close">Close</button>
    </div>`, { wide: true, label: 'Store detail' });

  m.el.querySelector('#sd-close').onclick = () => m.close();
}

/* ==================== TICKETS ==================== */
VIEWS['admin-tickets'] = async function (c) {
  c.innerHTML = skelBox();
  let [ticketData, apptData] = await Promise.all([
    api('/api/admin/tickets').catch(() => ({ tickets: [] })),
    api('/api/admin/appointments').catch(() => ({ appointments: [] }))
  ]);

  const tickets = ticketData.tickets || [];
  const appts = apptData.appointments || [];

  c.innerHTML = adminTopbar('Tickets & Appointments', 'Monitor consultation requests, appointments, and chat sessions.') + `
    <div class="grid g4 mb">
      <div class="card stat"><b data-n="${tickets.length}">0</b><span>Total Tickets</span></div>
      <div class="card stat"><b data-n="${tickets.filter(t => t.status === 'pending').length}">0</b><span>Pending</span></div>
      <div class="card stat"><b data-n="${tickets.filter(t => t.status === 'accepted').length}">0</b><span>Accepted</span></div>
      <div class="card stat"><b data-n="${appts.length}">0</b><span>Appointments</span></div>
    </div>

    <div class="card mb">
      <h2>Consultation Tickets (${tickets.length})</h2>
      ${tickets.length === 0 ? '<div class="empty" style="margin-top:12px">No tickets yet</div>' : `
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Patient</th><th>Specialization</th><th>Symptoms</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${tickets.map(t => `
              <tr>
                <td>${esc(t.patientName || '—')}</td>
                <td><span class="chip neutral">${esc(t.specialization)}</span></td>
                <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.symptoms || '—')}</td>
                <td>${ticketChip(t.status)}</td>
                <td style="font-size:12px">${new Date(t.createdAt).toLocaleString()}</td>
                <td style="white-space:nowrap">
                  <button class="btn sm secondary" data-view-t="${t.id}">View</button>
                  ${t.status === 'pending' ? `<button class="btn sm danger-outline" data-del-t="${t.id}">Cancel</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <h2>Appointments (${appts.length})</h2>
      ${appts.length === 0 ? '<div class="empty" style="margin-top:12px">No appointments yet</div>' : `
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Doctor</th><th>Patient</th><th>Slot</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${appts.map(a => `
              <tr>
                <td>${esc(a.doctorName)}</td>
                <td>${esc(a.patientName)}</td>
                <td style="font-size:12px">${new Date(a.confirmedSlot).toLocaleString()}</td>
                <td><span class="chip ${a.status === 'confirmed' ? 'ok' : 'neutral'}">${esc(a.status)}</span></td>
                <td>${a.ticketId ? `<button class="btn sm secondary" data-view-t="${esc(a.ticketId)}">View</button>` : a.sessionLink ? `<button class="btn sm secondary" data-view-chat="${esc(a.id)}">Chat</button>` : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;

  c.querySelectorAll('[data-n]').forEach(el => animateNum(el, Number(el.dataset.n)));
  c.querySelectorAll('[data-view-t]').forEach(b => b.onclick = () => adminTicketDetail(b.dataset.viewT, c));
  c.querySelectorAll('[data-del-t]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Cancel this ticket?', 'The patient will need to raise a new request.', 'Cancel Ticket')) return;
    try { await api(`/api/admin/tickets/${b.dataset.delT}`, { method: 'DELETE' }); toast('Ticket cancelled.'); VIEWS['admin-tickets'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
};

async function adminTicketDetail(id, container) {
  let d;
  try { d = await api(`/api/admin/tickets/${id}`); } catch (e) { toast(e.message, 'err'); return; }
  const t = d.ticket;
  const appt = d.appointment;
  const msgs = d.messages || [];

  const m = openModal(`
    <h2>Ticket ${ticketChip(t.status)}</h2>
    <p class="page-sub">${esc(t.specialization)} · created ${new Date(t.createdAt).toLocaleString()}</p>

    <div class="grid g2 mt mb">
      <div class="card">
        <h3>Patient</h3>
        <p style="font-size:13px">${d.patient ? `<b>${esc(d.patient.name)}</b><br>${esc(d.patient.email)}` : esc(t.patientName || '—')}</p>
      </div>
      <div class="card">
        <h3>Doctor</h3>
        <p style="font-size:13px">${d.doctor ? `<b>${esc(d.doctor.name)}</b><br>${esc(d.doctor.specialization)}` : (t.assignedDoctorId ? esc(t.assignedDoctorId) : 'Not assigned')}</p>
      </div>
    </div>

    ${t.symptoms ? `
    <h3 class="mt mb">Symptoms</h3>
    <p style="font-size:13px;white-space:pre-wrap">${esc(t.symptoms)}</p>` : ''}

    ${t.urgency ? `<p style="font-size:12px"><b>Urgency:</b> ${esc(t.urgency)}</p>` : ''}
    ${t.preferredSlots?.length ? `<p style="font-size:12px"><b>Preferred slots:</b> ${t.preferredSlots.map(s => esc(s)).join(', ')}</p>` : ''}

    ${appt ? `
    <h3 class="mt mb">Appointment</h3>
    <p style="font-size:13px">Confirmed for <b>${new Date(appt.confirmedSlot).toLocaleString()}</b> · Status: ${esc(appt.status)}</p>
    ${appt.sessionLink ? `<p style="font-size:12px"><b>Session:</b> ${esc(appt.sessionLink)}</p>` : ''}
    ` : ''}

    ${msgs.length ? `
    <h3 class="mt mb">Chat Messages (${msgs.length})</h3>
    <div class="adm-chat-log">
      ${msgs.map(msg => `
        <div class="adm-chat-msg ${msg.senderRole === 'doctor' ? 'from-doctor' : 'from-patient'}">
          <div class="adm-chat-meta"><b>${esc(msg.senderName)}</b> · ${esc(msg.senderRole)} · ${new Date(msg.ts).toLocaleString()}</div>
          <div class="adm-chat-text">${esc(msg.text)}</div>
        </div>`).join('')}
    </div>` : (appt ? '<p class="page-sub mt">No chat messages yet.</p>' : '')}

    ${t.rejectionReason ? `<p style="font-size:12px;color:var(--destructive);margin-top:8px"><b>Rejection reason:</b> ${esc(t.rejectionReason)}</p>` : ''}

    <div class="row mt" style="justify-content:flex-end">
      <button class="btn secondary" id="td-close">Close</button>
    </div>`, { wide: true, label: 'Ticket detail' });

  m.el.querySelector('#td-close').onclick = () => m.close();
}

/* ==================== FEEDBACK ==================== */
VIEWS['admin-feedback'] = async function (c) {
  c.innerHTML = skelBox();
  let d;
  try { d = await api('/api/admin/feedback'); } catch { c.innerHTML = adminTopbar('User Feedback', '') + '<div class="card empty">Failed to load feedback.</div>'; return; }
  const items = d.feedback || [];
  const badge = t => ({ bug: '<span class="pill pill-critical">Bug</span>', idea: '<span class="pill pill-info">Idea</span>', praise: '<span class="pill pill-normal">Praise</span>' }[t] || '');

  c.innerHTML = adminTopbar('User Feedback', 'Review and resolve user-submitted feedback, bug reports, and ideas.') + `
    <div class="grid g3 mb">
      <div class="card stat"><b data-n="${items.length}">0</b><span>Total Feedback</span></div>
      <div class="card stat"><b data-n="${items.filter(f => f.type === 'bug').length}">0</b><span>Bugs</span></div>
      <div class="card stat"><b data-n="${items.filter(f => f.type === 'idea').length}">0</b><span>Ideas</span></div>
    </div>
    <div class="card">
      <div class="spread"><h2>All Feedback (${items.length})</h2></div>
      ${items.map(f => `
        <div class="fb-item">
          <div class="spread"><div>${badge(f.type)} <b style="font-size:13px">${esc(f.userEmail || '?')}</b></div>
            <button class="btn sm secondary" data-fb-del="${esc(f.id)}">Resolve</button></div>
          <div style="font-size:13px;margin-top:6px;white-space:pre-wrap">${esc(f.message)}</div>
          <div class="fb-meta">${new Date(f.ts).toLocaleString()}${f.page ? ` · ${esc(f.page)}` : ''}</div>
        </div>`).join('') || '<div class="empty">No feedback yet — it will appear here when users write in.</div>'}
    </div>`;

  c.querySelectorAll('[data-n]').forEach(el => animateNum(el, Number(el.dataset.n)));
  c.querySelectorAll('[data-fb-del]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Resolve feedback?', 'Remove this item from the queue?', 'Resolve')) return;
    try { await api(`/api/admin/feedback/${b.dataset.fbDel}`, { method: 'DELETE' }); toast('Resolved'); VIEWS['admin-feedback'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
};

/* ==================== SYSTEM ==================== */
VIEWS['admin-system'] = async function (c) {
  c.innerHTML = skelBox();
  let [ov, au, sess] = await Promise.all([
    api('/api/admin/overview').catch(() => null),
    api('/api/admin/audit').catch(() => ({ audit: [], totalTracked: 0 })),
    api('/api/admin/sessions').catch(() => ({ sessions: [], totalActive: 0 }))
  ]);
  if (!ov) { c.innerHTML = adminTopbar('System & Sessions', '') + '<div class="card empty">System data unavailable.</div>'; return; }

  const s = ov.stats;
  c.innerHTML = adminTopbar('System & Sessions', 'Platform storage, active sessions, and global audit trail.') + `
    <div class="grid g4 mb">
      <div class="card stat"><b>${s.users}</b><span>Users</span></div>
      <div class="card stat"><b>${s.activeSessions}</b><span>Active Sessions</span></div>
      <div class="card stat"><b>${s.reports}</b><span>Reports</span></div>
      <div class="card stat"><b>${s.auditEvents}</b><span>Audit Events</span></div>
    </div>

    <div class="card mb">
      <h2>System Info</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="chip ${ov.storage.mode === 'postgres' ? 'ok' : 'neutral'}">${ov.storage.mode === 'postgres' ? 'Supabase Postgres' : 'Local JSON file'}</span>
        <span class="chip ${ov.storage.fileStorage === 'supabase' ? 'ok' : 'neutral'}" title="Where uploaded report files live">${ov.storage.fileStorage === 'supabase' ? 'Supabase Storage files' : 'Local disk files'}</span>
        <span class="chip info">Node ${esc(ov.runtime.node)}</span>
        <span class="chip neutral">Uptime ${Math.floor(ov.runtime.uptimeSec / 60)}m ${ov.runtime.uptimeSec % 60}s</span>
      </div>
    </div>

    <div class="card mb">
      <h2>Active Sessions <span class="chip ${sess.totalActive > 0 ? 'ok' : 'neutral'}">${sess.totalActive}</span></h2>
      ${sess.sessions.length === 0 ? '<div class="empty" style="margin-top:8px">No active sessions</div>' : `
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>User</th><th>Role</th><th>Created</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            ${sess.sessions.map(s => `
              <tr>
                <td><b>${esc(s.userName)}</b><br><span class="page-sub" style="font-size:11px">${esc(s.userEmail)}</span></td>
                <td><span class="chip ${s.role === 'doctor' ? 'info' : s.role === 'store-owner' ? 'warn' : 'neutral'}">${esc(s.role)}</span></td>
                <td style="font-size:12px">${new Date(s.createdAt).toLocaleString()}</td>
                <td style="font-size:12px">${new Date(s.expiresAt).toLocaleString()}</td>
                <td><button class="btn sm danger-outline" data-revoke="${esc(s.tokenFull)}" ${s.userId === App.user.id ? 'disabled' : ''}>Revoke</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
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

  c.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    if (!await confirmDlg('Revoke session?', 'The user will be signed out immediately.', 'Revoke')) return;
    try { await api(`/api/admin/sessions/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Session revoked.'); VIEWS['admin-system'](c); }
    catch (e) { toast(e.message, 'err'); }
  });
};
