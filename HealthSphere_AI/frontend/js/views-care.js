/* ---------- Care team · Hospitals · Emergency mode · Settings ---------- */

function prioBadge(p) {
  return `<span class="prio prio-${p || 3}">P${p || 3}</span>`;
}

VIEWS.care = async function (container) {
  const { doctors, contacts } = await api('/api/care');
  container.innerHTML = `
    <div class="topbar"><div><h1>Care Team &amp; Emergency Contacts</h1>
      <div class="page-sub">Your family doctor, specialists and trusted people — in one place.</div></div></div>

    <div class="grid g2">
      <div class="card">
        <h2>My care team</h2>
        ${doctors.map(doc => `
          <div class="tl-event">
            <div class="initials">${esc(initialsOf(doc.name))}</div>
            <div style="flex:1">
              <div class="tl-title">${esc(doc.name)} ${doc.role === 'Family Doctor' ? '<span class="chip ok">family doctor</span>' : ''}</div>
              <div class="tl-detail">${esc([doc.specialty, doc.clinic].filter(Boolean).join(' · '))}</div>
              ${doc.phone ? `<a href="tel:${esc(doc.phone.replace(/\s/g, ''))}" style="font-size:12.5px;font-weight:600">${esc(doc.phone)}</a>` : ''}
              ${doc.notes ? `<div class="tl-detail">${esc(doc.notes)}</div>` : ''}
            </div>
            <button class="btn sm secondary" data-deldoc="${doc.id}">Remove</button>
          </div>`).join('') || '<div class="empty">No doctors added yet</div>'}

        <form id="f-doc" class="mt divider">
          <b style="font-size:13px">Add doctor</b>
          <div class="grid g2 mt" style="gap:8px">
            <input name="name" placeholder="Full name" required>
            <select name="role"><option>Specialist</option><option>Family Doctor</option></select>
            <input name="specialty" placeholder="Specialty e.g. Cardiologist">
            <input name="phone" placeholder="Phone">
            <input name="clinic" placeholder="Clinic / hospital" style="grid-column:1/-1">
          </div>
          <button class="btn mt sm">Add doctor</button>
        </form>
      </div>

      <div class="card">
        <div class="spread"><h2>Emergency contacts</h2>
          <button class="btn secondary sm" id="import-contacts">Import from device</button></div>
        ${contacts.map(c => `
          <div class="tl-event">
            ${prioBadge(c.priority)}
            <div style="flex:1">
              <div class="tl-title">${esc(c.name)} <span class="chip neutral">${esc(c.relation)}</span></div>
              <a href="tel:${esc(c.phone.replace(/\s/g, ''))}" style="font-size:12.5px;font-weight:600">${esc(c.phone)}</a>
              ${c.notes ? `<div class="tl-detail">${esc(c.notes)}</div>` : ''}
            </div>
            <button class="btn sm secondary" data-delct="${c.id}">Remove</button>
          </div>`).join('') || '<div class="empty">No emergency contacts yet</div>'}
        <div class="page-sub" style="font-size:11.5px;margin-top:4px">P1 is called first in emergency mode.</div>

        <form id="f-ct" class="mt divider">
          <b style="font-size:13px">Add contact</b>
          <div class="grid g2 mt" style="gap:8px">
            <input name="name" placeholder="Name" required>
            <input name="relation" placeholder="Relationship (Father…)">
            <input name="phone" placeholder="Phone" required>
            <select name="priority"><option value="1">Priority 1 — call first</option><option value="2">Priority 2</option><option value="3">Priority 3</option></select>
            <input name="notes" placeholder="Notes" style="grid-column:1/-1">
          </div>
          <button class="btn mt sm">Add contact</button>
        </form>
      </div>
    </div>`;

  container.querySelector('#f-doc').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/api/doctors', { method: 'POST', body: Object.fromEntries(fd) });
    toast('Doctor added.'); VIEWS.care(container);
  };
  container.querySelectorAll('[data-deldoc]').forEach(b => b.onclick = async () => {
    await api(`/api/doctors/${b.dataset.deldoc}`, { method: 'DELETE' }); VIEWS.care(container);
  });
  container.querySelector('#f-ct').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await api('/api/contacts', { method: 'POST', body: Object.fromEntries(fd) }); toast('Contact added.'); VIEWS.care(container); }
    catch (err) { toast(err.message, 'err'); }
  };
  container.querySelectorAll('[data-delct]').forEach(b => b.onclick = async () => {
    await api(`/api/contacts/${b.dataset.delct}`, { method: 'DELETE' }); VIEWS.care(container);
  });
  container.querySelector('#import-contacts').onclick = async () => {
    const go = await confirmDlg('Import device contacts?',
      'HealthSphere will read a simulated set of device contacts and add matching entries as priority-1 emergency contacts. This action is recorded in your consent and audit trail. Continue?',
      'Yes, import');
    if (!go) return;
    try {
      const r = await api('/api/contacts/import', { method: 'POST', body: { confirm: true } });
      toast(`Imported ${r.added.length} contact(s) with explicit consent.`); VIEWS.care(container);
    } catch (err) { toast(err.message, 'err'); }
  };
};

/* ================= HOSPITALS ================= */
const FACILITY_LABEL = { hospital: 'Hospital', clinic: 'Clinic', lab: 'Diagnostic lab', pharmacy: 'Pharmacy', emergency: 'Emergency care' };

VIEWS.hospitals = async function (container) {
  let loc = null;      // {lat,lng} — results always require an origin so only nearby hospitals show
  let source = 'sample';
  let type = 'hospital';
  // Generation token: async completions (geolocation, network) from a previous
  // visit must never touch the DOM after the user navigates away (#view is reused).
  const myRun = (container.__hospRun = (container.__hospRun || 0) + 1);
  const alive = () => container.isConnected && container.__hospRun === myRun;

  container.innerHTML = `
    <div class="topbar"><div><h1>Nearby Hospitals</h1>
      <div class="page-sub">Only hospitals near your live location — live OpenStreetMap data, ranked by distance.</div></div></div>

    <div class="card mb">
      <div class="spread">
        <div style="max-width:560px">
          <b>Find hospitals around your live location</b>
          <div class="page-sub">Your coordinates are used only to rank nearby hospitals and are never stored. You can also search any place by name to see hospitals around it.</div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn" id="geo">Use my live location</button>
        </div>
      </div>
      <div class="row divider" style="gap:8px">
        <form id="f-place" class="row" style="gap:6px;flex:1;min-width:240px">
          <input id="place-q" placeholder="Search any place — e.g. Andheri West, Mumbai or Koramangala" style="flex:1;min-width:200px">
          <button class="btn secondary sm">Search place</button>
        </form>
        <select id="typesel" style="width:auto">
          <option value="hospital">Hospitals</option>
          <option value="emergency">24×7 emergency</option><option value="clinic">Clinics &amp; doctors</option><option value="lab">Diagnostic labs</option>
          <option value="pharmacy">Pharmacies</option><option value="all">All types</option>
        </select>
        <input id="hq" placeholder="Filter by name…" style="width:170px">
      </div>
      <div class="row mt" style="gap:8px">
        <span id="src-badge"><span class="chip neutral">Offline sample data</span></span>
        <span id="loc-label" class="page-sub"></span>
      </div>
    </div>

    <div id="live-area" style="display:none" class="grid g2 mb">
      <div class="card" style="padding:0;overflow:hidden;min-height:340px">
        <iframe id="osm-map" title="Map" style="width:100%;height:100%;min-height:340px;border:none" loading="lazy"></iframe>
      </div>
      <div class="card" style="padding:14px 16px;max-height:420px;overflow-y:auto">
        <h2>Closest to you</h2>
        <div id="near-list"></div>
      </div>
    </div>

    <div class="mb" id="browse-head" style="display:none"><h2>Browse results</h2></div>
    <div id="results" class="grid g3"></div>`;

  const $ = s => container.querySelector(s);

  function setSource(src, originLabel) {
    const b = $('#src-badge');
    const locEl = $('#loc-label');
    if (!b || !locEl) return;
    if (src === 'live') b.innerHTML = '<span class="chip ok">Live OpenStreetMap data</span>';
    else if (src === 'error') b.innerHTML = '<span class="chip bad">' + esc(originLabel || 'Search failed') + '</span>';
    else b.innerHTML = '<span class="chip warn">Enable live location or search a place to see nearby hospitals</span>';
    if (src === 'live' && originLabel) locEl.textContent = 'Origin: ' + originLabel;
    else if (originLabel && originLabel.includes('your location')) locEl.textContent = 'Origin: ' + originLabel;
    else locEl.textContent = '';
  }

  function renderMap(lat, lng) {
    const area = $('#live-area'), map = $('#osm-map');
    if (!area || !map) return;
    area.style.display = 'grid';
    const d = 0.045;
    map.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
  }

  function dirUrl(f) {
    return `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;
  }

  function facilityCard(f, compact, isLive) {
    const showDist = isLive && f.distanceKm != null;
    return `
      ${compact ? '' : `<div class="spread"><b>${esc(f.name)}</b><span class="chip neutral">${FACILITY_LABEL[f.type] || f.type}</span></div>`}
      ${compact ? `<div class="tl-title">${esc(f.name)}</div>` : ''}
      <div class="page-sub" style="margin:3px 0 6px">${esc(f.address)}</div>
      <div class="row" style="gap:6px">
        ${showDist ? `<span class="chip ok">${f.distanceKm} km away</span>` : ''}
        ${!isLive && f.city ? `<span class="chip neutral">${esc(f.city)}</span>` : ''}
        ${f.hours && f.hours !== 'Hours not listed' ? `<span class="page-sub" style="font-size:11.5px;margin:0">${esc(f.hours)}</span>` : ''}
      </div>
      <div class="row mt" style="gap:5px">${(f.services || []).slice(0, 3).map(s => `<span class="chip info">${esc(s)}</span>`).join('')}</div>
      <div class="row mt" style="gap:6px">
        ${f.phone ? `<a class="btn sm secondary" href="tel:${esc(String(f.phone).replace(/\s/g, ''))}">Call</a>` : ''}
        ${f.lat != null ? `<a class="btn sm ghost" href="${dirUrl(f)}" target="_blank" rel="noopener">Directions</a>` : ''}
      </div>`;
  }

  function renderNear(facilities, isLive) {
    const nl = $('#near-list');
    if (!nl) return;
    nl.innerHTML = facilities.slice(0, 10).map((f, i) => `
      <div class="tl-event">
        <div class="initials" ${i === 0 ? 'style="background:var(--primary-soft);color:var(--primary-dark)"' : ''}>${String(i + 1).padStart(2, '0')}</div>
        <div style="flex:1">${facilityCard(f, true, isLive)}</div>
      </div>`).join('') || emptyState('No hospitals found here', 'Try widening the type filter or searching a nearby place.', { icon: 'map-pin' });
  }

  async function load({ lat, lng } = {}) {
    if (!alive()) return;
    const hqEl = $('#hq'), placeEl = $('#place-q');
    const liveArea = $('#live-area'), browseHead = $('#browse-head'), resultsEl = $('#results');
    if (!hqEl || !placeEl || !liveArea || !browseHead || !resultsEl) return;
    const params = new URLSearchParams({ type });
    const nameQ = hqEl.value.trim();
    if (nameQ) params.set('q', nameQ);
    if (lat != null) { params.set('lat', lat); params.set('lng', lng); }
    else {
      const placeQ = placeEl.value.trim();
      if (placeQ) params.set('place', placeQ);
      else {
        // No origin at all — never fall back to a non-nearby list.
        liveArea.style.display = 'none';
        browseHead.style.display = 'none';
        setSource('sample', '');
        resultsEl.innerHTML = '<div class="empty">Enable your live location or search a place above to see hospitals near you.<br><br><button class="btn" id="empty-geo">Use my live location</button></div>';
        const g = $('#empty-geo');
        if (g) g.onclick = () => $('#geo')?.click();
        return;
      }
    }
    resultsEl.innerHTML = '<div class="skel" style="height:150px"></div><div class="skel" style="height:150px"></div><div class="skel" style="height:150px"></div>';
    let r;
    try { r = await api('/api/hospitals?' + params); }
    catch (e) { if (alive() && $('#results')) $('#results').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!alive()) return;

    source = r.source;
    if (r.source === 'error') { setSource('error', r.error); $('#results').innerHTML = `<div class="empty">${esc(r.error || 'Nothing found')}</div>`; return; }
    setSource(r.source, r.origin?.label || (r.origin && !r.origin.label ? `${(+r.origin.lat).toFixed(4)}, ${(+r.origin.lng).toFixed(4)}` : ''));

    const list = r.facilities || [];
    const isLive = r.source === 'live';
    if ((isLive || r.origin) && r.origin) { renderMap(r.origin.lat, r.origin.lng); renderNear(list, isLive); }
    else if ($('#live-area')) $('#live-area').style.display = 'none';
    if (!alive()) return;
    $('#browse-head').style.display = list.length ? 'block' : 'none';
    $('#results').innerHTML = list.map(f => `<div class="card hoverable">${facilityCard(f, false, isLive)}</div>`).join('')
      || emptyState('Nothing matches', 'Widen your filters or try another place to find hospitals nearby.', { icon: 'search' });
  }

  $('#geo').onclick = () => {
    if (!navigator.geolocation) return toast('Geolocation not available in this browser', 'err');
    toast('Requesting your location…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!alive()) return;
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const pq = $('#place-q');
        if (pq) pq.value = '';
        setSource('live', `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} (your location)`);
        load(loc);
      },
      () => toast('Location permission denied — search a place name instead.', 'err'),
      { enableHighAccuracy: true, timeout: 12000 });
  };

  $('#f-place').onsubmit = e => { e.preventDefault(); loc = null; load(); };
  $('#typesel').onchange = e => { type = e.target.value; load(loc || undefined); };
  let deb;
  $('#hq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => load(loc || undefined), 400); };

  // Auto-request live location on open — browser shows its native permission prompt.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!alive()) return;
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSource('live', `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} (your location)`);
        load(loc);
      },
      () => { load(); }, // declined — prompt state, never a non-nearby list
      { enableHighAccuracy: true, timeout: 9000 });
  } else {
    load();
  }
};

/* ================= EMERGENCY MODE ================= */
VIEWS.emergency = async function (container) {
  const card = await api('/api/emergency');
  const sos = await api('/api/sos').catch(() => ({ alerts: [], primaryContact: null }));

  container.innerHTML = `
  <div class="emergency-page">
    <div class="spread mb">
      <h1 style="color:#f0b9b9">EMERGENCY MODE</h1>
      <button class="btn secondary" id="exit-em">Exit emergency mode</button>
    </div>

    <button class="ebtn primary-call" onclick="location.href='tel:112'">CALL EMERGENCY SERVICES — 112<span>&rsaquo;</span></button>
    ${card.doctor ? `<a class="ebtn" href="tel:${esc((card.doctor.phone || '').replace(/\s/g, ''))}">CALL FAMILY DOCTOR — ${esc(card.doctor.name.toUpperCase())}<span>&rsaquo;</span></a>` : ''}
    ${(card.contacts || []).slice(0, 3).map(c => `
      <a class="ebtn" href="tel:${esc((c.phone || '').replace(/\s/g, ''))}">
        CALL ${esc(c.name.toUpperCase())} (${esc(c.relation)}) — P${c.priority}<span>&rsaquo;</span></a>`).join('')}
    <a class="ebtn" href="#/hospitals">FIND NEARBY HOSPITALS<span>&rsaquo;</span></a>

    <div class="ecard mt" style="text-align:center">
      <h3>Emergency SOS</h3>
      <p class="sos-sub">Alert your saved emergency contacts and open a pre-filled message to local services.</p>
      <button class="sos-btn" id="sos-btn">SOS</button>
      <p class="sos-caption">Pressing <b>SOS</b> records an alert and prepares a text-format message with your
        location link (if permission is granted) for your <b>primary contact</b> first.
        It does <b>not</b> replace calling your local emergency number.</p>
    </div>

    <div class="ecard mt">
      <h3>Recent alerts</h3>
      ${(sos.alerts || []).length ? sos.alerts.map(a => `
        <div class="erow" style="align-items:flex-start">
          <span><small style="color:#d99">${new Date(a.ts).toLocaleString()}</small>
            <span class="chip ${a.status === 'cancelled' ? 'neutral' : 'bad'}" style="margin-left:8px">${esc(a.status)}</span><br>
            <small style="color:#e8d5c4;word-break:break-word">${esc(a.message.length > 140 ? a.message.slice(0, 140) + '…' : a.message)}
            ${a.hasLocation ? ' · 📍' : ''}</small></span>
          ${a.status === 'active' ? `<button class="btn sm secondary" data-sos-cancel="${esc(a.id)}">Call off</button>` : ''}
        </div>`).join('') : '<div class="sos-empty">No alerts triggered yet</div>'}
    </div>

    <div class="ecard mt">
      <h3>My emergency information</h3>
      <div class="erow"><span>Blood group</span><b>${esc(card.bloodGroup || '—')}</b></div>
      <div class="erow"><span>Allergies</span><b>${(card.allergies || []).map(esc).join(', ') || 'None recorded'}</b></div>
      <div class="erow"><span>Conditions</span><b>${(card.conditions || []).map(esc).join(', ') || 'None recorded'}</b></div>
      <div class="erow"><span>Current medications</span><b>${(card.medications || []).map(m => esc(m.name || m)).join(', ') || 'None recorded'}</b></div>
      <div class="erow"><span>Born</span><b>${fmtDateUI(card.dob)}</b></div>
    </div>

    <div class="ecard mt">
      <h3>Nearby emergency hospitals — your live location</h3>
      <div id="er-list"><div class="sos-empty">Detecting your location…</div></div>
    </div>

    <div class="sos-banner mt">In a real emergency, always call your local emergency number directly.
      This feature is a notification aid, not a life-safety service.</div>
    <p style="font-size:11.5px;color:#c98;margin-top:16px">If this is a life-threatening emergency, call local emergency services immediately.</p>
  </div>`;

  container.querySelector('#exit-em').onclick = () => { location.hash = '#/dashboard'; };

  /* ---- Nearby emergency hospitals from live location (never a fixed city) ---- */
  const erList = container.querySelector('#er-list');
  const paintER = list => {
    erList.innerHTML = (list || []).map(f => `
      <div class="erow"><span>${esc(f.name)}${f.distanceKm != null ? ` <small style="color:#d99">· ${f.distanceKm} km away</small>` : ''}<br><small style="color:#d99">${esc(f.address)} · ${esc(f.hours)}</small></span>
      ${f.phone ? `<a href="tel:${esc(String(f.phone).replace(/\s/g, ''))}" style="color:#ffb4b4;font-weight:650">${esc(f.phone)}</a>` : ''}</div>`).join('')
      || '<div class="sos-empty">No emergency hospitals found near you</div>';
  };
  const loadER = (lat, lng) => {
    const p = new URLSearchParams({ type: 'emergency', lat, lng });
    api('/api/hospitals?' + p)
      .then(r => paintER((r.facilities || []).slice(0, 4)))
      .catch(() => { erList.innerHTML = '<div class="sos-empty">Could not load nearby hospitals</div>'; });
  };
  const erDenied = () => {
    erList.innerHTML = '<div class="sos-empty">Location unavailable — <button class="btn sm secondary" id="er-retry">Use my location</button> or open <a href="#/hospitals" style="color:#ffb4b4">Nearby Hospitals</a></div>';
    const b = container.querySelector('#er-retry');
    if (b && navigator.geolocation) b.onclick = () => navigator.geolocation.getCurrentPosition(
      pos => loadER(pos.coords.latitude, pos.coords.longitude), () => toast('Location permission denied', 'err'), { timeout: 9000 });
  };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => loadER(pos.coords.latitude, pos.coords.longitude),
      erDenied,
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  } else {
    erList.innerHTML = '<div class="sos-empty">Geolocation not supported — open <a href="#/hospitals" style="color:#ffb4b4">Nearby Hospitals</a> and search a place</div>';
  }

  /* ---- SOS trigger ---- */
  const btn = container.querySelector('#sos-btn');
  btn.onclick = async () => {
    const go = await confirmDlg('Trigger SOS alert?',
      'An alert will be recorded and you will get the pre-filled message to send to your primary contact. Continue only if you need urgent help.',
      'Send SOS alert');
    if (!go) return;
    btn.disabled = true;
    btn.textContent = '…';
    const finish = () => { btn.disabled = false; btn.textContent = 'SOS'; };
    const send = pos => {
      api('/api/sos', {
        method: 'POST',
        body: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}
      }).then(showDispatch).catch(e => { toast(e.message, 'err'); finish(); });
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(send, () => send(null), { timeout: 4500, maximumAge: 60000 });
    } else send(null);
  };

  function showDispatch(r) {
    const pc = r.primaryContact;
    const digits = pc ? String(pc.phone).replace(/[^\d+]/g, '').replace(/^\+/, '') : '';
    const m = openModal(`
      <div class="spread"><h2 style="color:#7f1d1d">SOS alert recorded</h2></div>
      <p class="page-sub">${esc(r.alert.message)}</p>
      ${pc ? `
        <div class="row mt" style="gap:8px;flex-wrap:wrap">
          <a class="btn danger" href="sms:${esc(digits)}?body=${encodeURIComponent(r.alert.message)}">Send SMS to ${esc(pc.name)} (P${pc.priority})</a>
          <a class="btn secondary" href="https://wa.me/${esc(digits)}?text=${encodeURIComponent(r.alert.message)}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn primary-call" style="border-radius:10px;display:inline-flex;padding:10px 18px;font-size:13px" href="tel:112">Also call 112</a>
        </div>`
        : '<div class="empty">No emergency contacts saved yet — add one in Care Team so alerts can be sent.</div>'}
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn secondary" id="sos-done">Done</button>
      </div>`);
    m.el.querySelector('#sos-done').onclick = () => { m.close(); VIEWS.emergency(container); };
  }

  container.querySelectorAll('[data-sos-cancel]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await api(`/api/sos/${b.dataset.sosCancel}/cancel`, { method: 'POST' });
      toast('Alert called off.');
      VIEWS.emergency(container);
    } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  });
};

/* ================= SETTINGS ================= */
VIEWS.settings = async function (container) {
  const [{ settings }, { audit }] = await Promise.all([api('/api/me'), api('/api/audit')]);
  const s = settings || {};

  container.innerHTML = `
    <div class="topbar"><div><h1>Settings, Privacy &amp; Data Rights</h1>
      <div class="page-sub">You control who accesses what. Every change is audited.</div></div></div>

    <div class="grid g2">
      <div class="card">
        <h2>Consent management</h2>
        ${consentRow('contactsImport', 'Allow importing device contacts', s.consents?.contactsImport)}
        ${consentRow('location', 'Allow location for nearby healthcare', s.consents?.location)}
        ${consentRow('shareReports', 'Allow sharing reports outside the app', s.consents?.shareReports)}
        ${consentRow('familyView', 'Let chosen family members view shared info', s.consents?.familyView)}
      </div>

      <div class="card">
        <h2>Notification preferences</h2>
        ${notifRow('health', 'Health — measurements and follow-ups', s.notifications?.health)}
        ${notifRow('lifestyle', 'Lifestyle — exercise, hydration, sleep', s.notifications?.lifestyle)}
        ${notifRow('healthcare', 'Healthcare — appointments and reviews', s.notifications?.healthcare)}
        ${notifRow('emergency', 'Emergency alerts', s.notifications?.emergency)}

        <h2 class="mt">Change password</h2>
        <form id="f-pass" class="row" style="gap:8px;align-items:flex-end">
          <div style="flex:1"><label>Current</label><input type="password" name="current" required></div>
          <div style="flex:1"><label>New (min 6)</label><input type="password" name="next" minlength="6" required></div>
          <button class="btn sm">Update</button>
        </form>
      </div>

      <div class="card">
        <h2>Your data rights</h2>
        <div class="row">
          <a class="btn secondary" href="/api/export" download>Export all my data (JSON)</a>
          <a class="btn secondary" href="#/storage">Manage file storage</a>
          <button class="btn danger-outline" id="del-account">Delete account and data</button>
        </div>
        <div class="disclaimer">Export includes profile, family history, report metadata, extracted values, logs, plans and consents. Deletion is immediate and irreversible.</div>
      </div>

      <div class="card">
        <h2>Audit log (latest)</h2>
        <div style="max-height:260px;overflow-y:auto;font-size:12.5px">
          ${audit.map(a => `<div class="tl-event" style="padding:5px 0">
            <div><b>${esc(a.action)}</b> ${a.detail ? `· ${esc(a.detail)}` : ''}<div class="tl-date">${new Date(a.ts).toLocaleString()}</div></div></div>`).join('')
          || '<div class="empty">No activity yet</div>'}
        </div>
      </div>
    </div>`;

  function consentRow(key, label, on) {
    return `<label class="spread" style="cursor:pointer;padding:7px 0;border-bottom:1px dashed var(--line)">
      <span style="font-size:13.5px;color:var(--ink);font-weight:500">${label}</span>
      <input type="checkbox" data-consent="${key}" ${on ? 'checked' : ''}></label>`;
  }
  function notifRow(key, label, on) {
    return `<label class="spread" style="cursor:pointer;padding:7px 0;border-bottom:1px dashed var(--line)">
      <span style="font-size:13.5px;color:var(--ink);font-weight:500">${label}</span>
      <input type="checkbox" data-notif="${key}" ${on ? 'checked' : ''}></label>`;
  }

  container.querySelectorAll('[data-consent]').forEach(cb => cb.onchange = async () => {
    await api('/api/settings', { method: 'PUT', body: { consents: { [cb.dataset.consent]: cb.checked } } });
    toast('Consent preference saved and audited.');
  });
  container.querySelectorAll('[data-notif]').forEach(cb => cb.onchange = async () => {
    await api('/api/settings', { method: 'PUT', body: { notifications: { [cb.dataset.notif]: cb.checked } } });
    toast('Notification preference saved.');
  });

  container.querySelector('#f-pass').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Password updated.');
    } catch (err) { toast(err.message, 'err'); }
  };

  container.querySelector('#del-account').onclick = async () => {
    const go = await confirmDlg('Delete account permanently?',
      'This removes your account and ALL associated health data immediately. This cannot be undone.', 'Delete everything');
    if (!go) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      toast('Account deleted.');
      setTimeout(() => location.reload(), 900);
    } catch (err) { toast(err.message, 'err'); }
  };
};
