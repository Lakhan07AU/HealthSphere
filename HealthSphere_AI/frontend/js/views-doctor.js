/* ---------- Doctor Dashboard View ---------- */

VIEWS['doctor-dashboard'] = async function (container) {
  let data;
  try { data = await api('/api/doctor/dashboard'); }
  catch (e) { container.innerHTML = '<div class="card empty">Could not load dashboard. Your session may have expired.</div>'; return; }

  const d = data.doctor;
  const isVerified = d.verificationStatus === 'verified';
  const isOnline = d.availabilityStatus === 'online';
  const pending = data.pendingTickets || [];
  const upcoming = data.myAppointments || [];
  const past = data.pastAppointments || [];

  const statusChip = !isVerified
    ? '<span class="chip warn">Pending Verification</span>'
    : isOnline
      ? '<span class="chip ok">Online — Receiving Tickets</span>'
      : '<span class="chip neutral">Offline</span>';

  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Welcome, ${esc(d.name)}</h1>
        <div class="page-sub">${esc(d.specialization)} · ${esc(d.qualification)} ${statusChip}</div>
      </div>
      <div class="row">
        ${isVerified ? `
          <div class="avail-toggle-wrap">
            <label class="avail-toggle">
              <input type="checkbox" id="avail-toggle" ${isOnline ? 'checked' : ''}>
              <span class="avail-slider"></span>
            </label>
            <span id="avail-label" style="font-size:13px;font-weight:600">${isOnline ? 'Online' : 'Offline'}</span>
          </div>
        ` : '<div class="page-sub" style="font-size:12px">Account pending admin verification</div>'}
        <button class="btn sm secondary" id="doc-logout">Sign out</button>
      </div>
    </div>

    <div class="grid g4 mb">
      <div class="card stat"><b>${pending.length}</b><span>Pending Tickets</span></div>
      <div class="card stat"><b>${upcoming.length}</b><span>Upcoming</span></div>
      <div class="card stat"><b>${past.length}</b><span>Past Consults</span></div>
      <div class="card stat"><b>${d.yearsExp || 0}</b><span>Years Exp.</span></div>
    </div>

    ${!isVerified ? `
      <div class="card mb">
        <div class="spread">
          <div>
            <h2>Account Under Review</h2>
            <p class="page-sub">Your registration is being verified by our admin team. You will be able to go online and receive consultation tickets once approved.</p>
          </div>
          <span class="chip warn">Pending</span>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
          <div style="font-size:12px;color:var(--ink-soft)">
            <b>Submitted credentials:</b> ${esc(d.qualification)} · ${esc(d.specialization)} · License: ${esc(d.licenseNumber)}
            ${d.yearsExp ? ` · ${d.yearsExp} years experience` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card mb" id="tickets-section">
      <div class="spread">
        <h2>Incoming Consultation Tickets <span class="chip info">${pending.length}</span></h2>
        ${isOnline ? '<span class="chip ok" style="font-size:10px">You are visible to patients</span>' : ''}
      </div>
      <div id="tickets-list">
        ${pending.length === 0
          ? `<div class="empty" style="margin-top:12px">No pending tickets right now. ${isOnline ? 'Patients will see you as available and can submit tickets.' : 'Go online to receive tickets.'}</div>`
          : pending.map(t => ticketCard(t)).join('')}
      </div>
    </div>

    <div class="grid g2">
      <div class="card">
        <div class="spread">
          <h2>Upcoming Appointments</h2>
          <span class="chip neutral">${upcoming.length}</span>
        </div>
        ${upcoming.length === 0
          ? '<div class="empty" style="margin-top:12px">No upcoming appointments</div>'
          : upcoming.map(a => appointmentCard(a, true)).join('')}
      </div>
      <div class="card">
        <div class="spread">
          <h2>Past Consultations</h2>
          <span class="chip neutral">${past.length}</span>
        </div>
        ${past.length === 0
          ? '<div class="empty" style="margin-top:12px">No past consultations</div>'
          : past.map(a => appointmentCard(a, false)).join('')}
      </div>
    </div>
  `;

  function ticketCard(t) {
    const urgencyMap = {
      urgent: { cls: 'bad', label: 'Urgent' },
      normal: { cls: 'warn', label: 'Normal' },
      low: { cls: 'info', label: 'Low' }
    };
    const urg = urgencyMap[t.urgency] || urgencyMap.normal;
    const timeLeft = t.expiresAt
      ? Math.max(0, Math.round((new Date(t.expiresAt) - new Date()) / 60000))
      : null;

    return `
      <div class="ticket-card" data-ticket-id="${t.id}" style="border-left:3px solid ${t.urgency === 'urgent' ? 'var(--red-500, #ef4444)' : 'var(--yellow-500, #eab308)'}">
        <div class="spread">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <b>${esc(t.patientName)}</b>
              <span class="chip ${urg.cls}" style="font-size:9px">${urg.label}</span>
              ${timeLeft != null && timeLeft > 0 ? `<span style="font-size:11px;color:var(--ink-faint)">⏰ ${timeLeft} min left</span>` : ''}
            </div>
            <div class="page-sub" style="font-size:12px">
              ${t.symptoms ? esc(t.symptoms) : '<em>No symptoms provided</em>'}
            </div>
            ${t.preferredSlots && t.preferredSlots.length ? `
              <div style="font-size:12px;color:var(--ink-soft);margin-top:4px">
                <b>Preferred:</b> ${t.preferredSlots.map(s => esc(s)).join(', ')}
              </div>
            ` : ''}
            <div class="page-sub" style="font-size:11px;margin-top:2px">Created ${new Date(t.createdAt).toLocaleString()}</div>
          </div>
          <div class="row" style="gap:6px">
            <button class="btn sm" data-accept="${t.id}">✅ Accept</button>
            <button class="btn sm danger-outline" data-reject="${t.id}">❌ Reject</button>
          </div>
        </div>
      </div>`;
  }

  function appointmentCard(a, isUpcoming) {
    return `
      <div class="appointment-card" style="border-left:3px solid ${isUpcoming ? 'var(--primary)' : 'var(--ink-faint)'}">
        <div class="spread">
          <div>
            <b>🧑 ${esc(a.patientName)}</b>
            <div class="page-sub" style="font-size:12px;margin-top:2px">
              ${new Date(a.confirmedSlot).toLocaleString()}
            </div>
            ${a.ticketId ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:1px">Ticket: ${esc(a.ticketId)}</div>` : ''}
          </div>
          <div class="row">
            ${a.status === 'confirmed' && isUpcoming ? `<a class="btn sm" href="#/consult/room/${esc(a.sessionId || '')}">💬 Join Chat</a>` : ''}
            <span class="chip ${a.status === 'confirmed' ? 'ok' : 'neutral'}">${esc(a.status)}</span>
          </div>
        </div>
      </div>`;
  }

  // Availability toggle
  const toggle = container.querySelector('#avail-toggle');
  if (toggle) {
    toggle.onchange = async () => {
      const status = toggle.checked ? 'online' : 'offline';
      try {
        await api('/api/doctor/availability', { method: 'POST', body: { status } });
        const label = container.querySelector('#avail-label');
        if (label) label.textContent = status === 'online' ? 'Online' : 'Offline';
        toast(`You are now ${status}. ${status === 'online' ? 'Patients can find you and submit tickets.' : 'You will not receive new tickets.'}`);
        VIEWS['doctor-dashboard'](container);
      } catch (e) {
        toast(e.message, 'err');
        toggle.checked = !toggle.checked;
      }
    };
  }

  // Accept ticket buttons
  container.querySelectorAll('[data-accept]').forEach(btn => {
    btn.onclick = async () => {
      const ticketId = btn.dataset.accept;
      btn.disabled = true;
      btn.textContent = 'Accepting...';
      try {
        const r = await api(`/api/doctor/tickets/${ticketId}/accept`, { method: 'POST', body: {} });
        toast('Ticket accepted! Appointment created. You can now chat with the patient.');
        VIEWS['doctor-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '✅ Accept'; }
    };
  });

  // Reject ticket buttons
  container.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = async () => {
      const ticketId = btn.dataset.reject;
      if (!await confirmDlg('Reject this ticket?', 'The patient will be notified that this ticket was declined. They may need to find another doctor.', 'Reject')) return;
      btn.disabled = true;
      try {
        await api(`/api/doctor/tickets/${ticketId}/reject`, { method: 'POST', body: { reason: 'Doctor unavailable' } });
        toast('Ticket rejected.');
        VIEWS['doctor-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    };
  });

  // Logout
  container.querySelector('#doc-logout').onclick = async () => {
    await api('/api/doctor/auth/logout', { method: 'POST' });
    App.doctorUser = null;
    location.hash = '#/doctor/login';
    App.routeDoctor();
  };
};
