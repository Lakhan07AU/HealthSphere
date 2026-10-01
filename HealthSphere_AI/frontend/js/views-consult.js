/* ---------- Patient Consultation View ---------- */

VIEWS.consult = async function (container) {
  container.innerHTML = `<div class="loading-placeholder">Loading consultations...</div>`;

  let ticketData, specData, apptData;
  try {
    [ticketData, specData, apptData] = await Promise.all([
      api('/api/consult/tickets'),
      api('/api/consult/specializations'),
      api('/api/consult/appointments')
    ]);
  } catch (e) {
    container.innerHTML = `<div class="card empty">Could not load consultation data. Please sign in again.</div>`;
    return;
  }

  const tickets = ticketData.tickets || [];
  const specs = specData.specializations || [];
  const onlineCount = specData.onlineCount || 0;
  const onlineBySpec = specData.onlineBySpecialization || {};
  const upcoming = apptData.upcoming || [];
  const past = apptData.past || [];

  const activeTickets = tickets.filter(t => t.status === 'pending' || t.status === 'accepted');
  const pastTickets = tickets.filter(t => t.status === 'rejected' || t.status === 'expired');

  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Consult a Doctor</h1>
        <div class="page-sub">${onlineCount} doctor${onlineCount !== 1 ? 's' : ''} currently online across ${specs.length} specializations</div>
      </div>
    </div>

    <div class="card mb">
      <h2>Raise a Consultation Ticket</h2>
      <p class="page-sub" style="margin-bottom:14px">Describe your concern and preferred time. Available doctors in the matching specialization will be notified. Tickets expire in 15 minutes if no doctor accepts.</p>
      <form id="f-ticket">
        <div class="grid g2">
          <div>
            <label>Specialization</label>
            <select name="specialization" id="spec-select" required>
              <option value="">Select specialty</option>
              ${specs.map(s => {
                const count = onlineBySpec[s] || 0;
                return `<option value="${s}">${s}${count > 0 ? ` (${count} online)` : ''}</option>`;
              }).join('')}
              ${specs.length === 0 ? '<option value="General Physician">General Physician</option>' : ''}
            </select>
          </div>
          <div>
            <label>Urgency</label>
            <select name="urgency">
              <option value="normal">Normal</option>
              <option value="low">Low priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div class="mt"></div>
        <label>Symptoms / Reason for consultation</label>
        <textarea name="symptoms" rows="3" placeholder="Describe your symptoms or reason for the consultation..."></textarea>
        <div class="mt"></div>
        <label>Preferred Time Slot(s) — optional</label>
        <input name="preferredSlots" placeholder="e.g. Tomorrow 10AM-12PM, Today after 5PM">
        <button class="btn big mt" type="submit">Submit Ticket</button>
      </form>
    </div>

    <div class="grid g2">
      <div class="card">
        <div class="spread">
          <h2>My Tickets</h2>
          <span class="chip neutral">${tickets.length}</span>
        </div>
        ${activeTickets.length > 0 ? `
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin:12px 0 6px">Active</div>
          ${activeTickets.map(t => ticketRow(t)).join('')}
        ` : ''}
        ${pastTickets.length > 0 ? `
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin:14px 0 6px">Past</div>
          ${pastTickets.map(t => ticketRow(t)).join('')}
        ` : ''}
        ${tickets.length === 0 ? '<div class="empty" style="margin-top:12px">No consultation tickets yet</div>' : ''}
      </div>

      <div class="card">
        <div class="spread">
          <h2>Appointments</h2>
          <span class="chip neutral">${upcoming.length + past.length}</span>
        </div>
        ${upcoming.length > 0 ? `
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin:12px 0 6px">Upcoming</div>
          ${upcoming.map(a => apptRow(a, true)).join('')}
        ` : ''}
        ${past.length > 0 ? `
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin:14px 0 6px">Past</div>
          ${past.map(a => apptRow(a, false)).join('')}
        ` : ''}
        ${upcoming.length === 0 && past.length === 0 ? '<div class="empty" style="margin-top:12px">No appointments yet</div>' : ''}
      </div>
    </div>
  `;

  function ticketRow(t) {
    const statusMap = {
      pending: { label: 'Seeking Doctor', cls: 'warn', icon: '⏳' },
      accepted: { label: 'Accepted', cls: 'ok', icon: '✅' },
      rejected: { label: 'Rejected', cls: 'bad', icon: '❌' },
      expired: { label: 'Expired', cls: 'neutral', icon: '⏰' }
    };
    const st = statusMap[t.status] || statusMap.pending;
    const doctorInfo = t.doctorInfo;
    const timeLeft = t.expiresAt && t.status === 'pending'
      ? Math.max(0, Math.round((new Date(t.expiresAt) - new Date()) / 60000))
      : null;

    return `
      <div class="ticket-row" style="border-left:3px solid ${t.status === 'accepted' ? 'var(--green-600)' : t.status === 'pending' ? 'var(--yellow-500)' : 'var(--ink-faint)'}">
        <div class="spread">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <b style="font-size:13px">${esc(t.specialization)}</b>
              <span class="chip ${st.cls}" style="font-size:9px">${st.icon} ${st.label}</span>
              ${timeLeft != null ? `<span style="font-size:11px;color:var(--ink-faint)">${timeLeft} min left</span>` : ''}
            </div>
            <div class="page-sub" style="font-size:12px">${t.symptoms ? esc(t.symptoms) : '<em>No symptoms</em>'}</div>
            ${t.preferredSlots && t.preferredSlots.length
              ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">Preferred: ${t.preferredSlots.map(s => esc(s)).join(', ')}</div>`
              : ''}
            <div style="font-size:11px;color:var(--ink-faint);margin-top:2px">${new Date(t.createdAt).toLocaleString()}</div>
            ${doctorInfo ? `
              <div style="margin-top:6px;padding:6px 8px;background:var(--bg-light, #f0fdf4);border-radius:6px;font-size:12px">
                <span style="color:var(--green-600);font-weight:600">👨‍⚕️ Dr. ${esc(doctorInfo.name)}</span>
                <span style="color:var(--ink-soft)"> · ${esc(doctorInfo.qualification)} · ${esc(doctorInfo.specialization)}</span>
              </div>
            ` : ''}
          </div>
          <div class="row" style="gap:6px">
            ${t.status === 'accepted' && t.sessionId
              ? `<a class="btn sm" href="#/consult/room/${esc(t.sessionId)}">💬 Chat Now</a>`
              : ''}
          </div>
        </div>
      </div>`;
  }

  function apptRow(a, isUpcoming) {
    const doctorInfo = a.doctorInfo;
    return `
      <div class="appointment-card" style="border-left:3px solid ${isUpcoming ? 'var(--primary)' : 'var(--ink-faint)'}">
        <div class="spread">
          <div>
            <b style="font-size:13px">👨‍⚕️ Dr. ${esc(doctorInfo?.name || a.doctorName)}</b>
            ${doctorInfo ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:1px">${esc(doctorInfo.specialization)} · ${esc(doctorInfo.qualification)}</div>` : ''}
            <div class="page-sub" style="font-size:12px;margin-top:2px">${new Date(a.confirmedSlot).toLocaleString()}</div>
          </div>
          <div class="row">
            ${isUpcoming && a.sessionLink ? `<a class="btn sm" href="#/consult/room/${esc(a.sessionId || '')}">💬 Join Chat</a>` : ''}
            <span class="chip ${a.status === 'confirmed' ? 'ok' : 'neutral'}">${esc(a.status)}</span>
          </div>
        </div>
      </div>`;
  }

  // Submit ticket
  container.querySelector('#f-ticket').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const slotsRaw = fd.get('preferredSlots') || '';
    const slots = slotsRaw ? slotsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    try {
      await api('/api/consult/tickets', {
        method: 'POST',
        body: {
          specialization: fd.get('specialization'),
          symptoms: fd.get('symptoms'),
          urgency: fd.get('urgency'),
          preferredSlots: slots
        }
      });
      toast('Ticket submitted! Waiting for a doctor to accept (expires in 15 min).');
      VIEWS.consult(container);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Submit Ticket'; }
  };
};

/* ---------- Consultation Room View ---------- */
VIEWS['consult-room'] = async function (container) {
  const roomId = location.hash.split('/').pop();

  // Try to find appointment by sessionId
  let aptId = roomId;
  let appointmentInfo = null;

  // Check if this is a session ID or appointment ID
  try {
    if (App.user) {
      const r = await api('/api/consult/appointments');
      const all = [...(r.upcoming || []), ...(r.past || [])];
      const match = all.find(a => a.sessionId === roomId || a.id === roomId);
      if (match) { aptId = match.id; appointmentInfo = match; }
    }
  } catch {}

  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Consultation Room</h1>
        <div class="page-sub">${appointmentInfo ? `With Dr. ${esc(appointmentInfo.doctorInfo?.name || appointmentInfo.doctorName || 'Doctor')}` : `Session: ${esc(aptId)}`}</div>
      </div>
      <a class="btn secondary" href="#/consult">Back to consultations</a>
    </div>
    <div class="card">
      <div class="chat-container">
        <div id="chat-messages" style="height:400px;overflow-y:auto;padding:14px;border:1px solid var(--line);border-radius:var(--radius-sm);background:#f8fafb;margin-bottom:12px">
          <div class="empty">Loading messages...</div>
        </div>
        <form id="chat-form" class="row">
          <input id="chat-input" placeholder="Type your message..." style="flex:1" autocomplete="off">
          <button class="btn" type="submit">Send</button>
        </form>
      </div>
    </div>
  `;

  async function loadMessages() {
    try {
      let r;
      if (App.user) {
        r = await api(`/api/consult/chat/${aptId}`);
      } else if (App.doctorUser) {
        r = await api(`/api/consult/messages/${aptId}`);
      } else {
        return;
      }
      const box = container.querySelector('#chat-messages');
      const msgs = r.messages || [];
      if (msgs.length === 0) {
        box.innerHTML = '<div class="empty">No messages yet. Start the conversation.</div>';
        return;
      }
      box.innerHTML = msgs.map(m => `
        <div class="chat-msg ${m.senderRole === 'patient' ? 'chat-patient' : 'chat-doctor'}">
          <div class="chat-sender"><b>${esc(m.senderName)}</b> <span class="chip ${m.senderRole === 'patient' ? 'info' : 'ok'}" style="font-size:8px">${esc(m.senderRole)}</span></div>
          <div class="chat-text">${esc(m.text)}</div>
          <div class="chat-time">${new Date(m.ts).toLocaleTimeString()}</div>
        </div>
      `).join('');
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }

  loadMessages();
  const pollInterval = setInterval(loadMessages, 5000);

  container.querySelector('#chat-form').onsubmit = async e => {
    e.preventDefault();
    const input = container.querySelector('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      if (App.user) {
        await api(`/api/consult/chat/${aptId}`, { method: 'POST', body: { text } });
      } else if (App.doctorUser) {
        await api(`/api/consult/messages/${aptId}`, { method: 'POST', body: { text } });
      }
      loadMessages();
    } catch (e) { toast(e.message, 'err'); }
  };

  // Cleanup on navigation
  const cleanup = () => { clearInterval(pollInterval); window.removeEventListener('hashchange', cleanup); };
  window.addEventListener('hashchange', cleanup);
};
