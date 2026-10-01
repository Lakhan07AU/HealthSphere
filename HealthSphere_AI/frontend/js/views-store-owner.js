/* ---------- Store Owner Dashboard View ---------- */

VIEWS['store-owner-dashboard'] = async function (container) {
  let data;
  try { data = await api('/api/store/me'); }
  catch (e) { container.innerHTML = '<div class="card empty">Could not load dashboard. Your session may have expired.</div>'; return; }

  const o = data.owner;
  const s = data.store;
  const isVerified = o.verificationStatus === 'verified';
  const statusChip = !isVerified
    ? '<span class="chip warn">Pending Approval</span>'
    : s.status === 'approved'
      ? '<span class="chip ok">Live</span>'
      : '<span class="chip neutral">' + esc(s.status) + '</span>';

  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>${esc(o.storeName)}</h1>
        <div class="page-sub">Store Owner: ${esc(o.ownerName)} ${statusChip}</div>
      </div>
      <button class="btn sm secondary" id="store-logout">Sign out</button>
    </div>

    ${!isVerified ? `
      <div class="card mb">
        <h2>Store Pending Approval</h2>
        <p class="page-sub">Your store listing is under review by our admin team. Once approved, your store will appear in the directory for patients to discover.</p>
      </div>
    ` : ''}

    <div class="grid g4 mb">
      <div class="card stat"><b>${s.views || 0}</b><span>Profile Views</span></div>
      <div class="card stat"><b>${s.clicks || 0}</b><span>Contact Clicks</span></div>
      <div class="card stat"><b>${(s.offers || []).length}</b><span>Active Offers</span></div>
      <div class="card stat"><b>${esc(s.category || '—')}</b><span>Category</span></div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h2>Store Details</h2>
        <form id="f-store-edit">
          <label>Store Name</label>
          <input name="storeName" value="${esc(s.name)}">
          <div class="mt"></div>
          <label>Category</label>
          <select name="category">
            ${['Pharmacy','Medical Equipment','Ayurvedic Store','Homeopathy Store','Surgical Supply','Optical Store','Health Supplement','Diagnostic Lab']
              .map(c => `<option value="${c}" ${s.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <div class="mt"></div>
          <label>Address</label>
          <textarea name="address" rows="2">${esc(s.address)}</textarea>
          <div class="mt"></div>
          <label>Contact Phone</label>
          <input name="contact" value="${esc(s.contact || '')}">
          <div class="mt"></div>
          <label>Operating Hours</label>
          <input name="hours" value="${esc(s.hours || '')}" placeholder="e.g. Mon-Sat: 9AM-9PM">
          <button class="btn mt" type="submit">Save Details</button>
        </form>
      </div>

      <div class="card">
        <div class="spread">
          <h2>Offers & Promotions</h2>
          <button class="btn sm" id="add-offer-btn">Add Offer</button>
        </div>
        <div id="offers-list">
          ${(s.offers || []).length === 0
            ? '<div class="empty" style="margin-top:12px">No offers yet. Add promotions to attract patients.</div>'
            : (s.offers || []).map((of, i) => `
              <div class="offer-item">
                <div class="spread">
                  <div>
                    <b style="font-size:13px">${esc(of.title || 'Untitled')}</b>
                    <div class="page-sub" style="font-size:12px">${esc(of.description || '')}</div>
                    ${of.validTill ? `<div style="font-size:11px;color:var(--ink-faint)">Valid till: ${esc(of.validTill)}</div>` : ''}
                  </div>
                  <button class="btn sm danger-outline" data-remove-offer="${i}">Remove</button>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="card mt">
      <h2>Preview — How patients see your store</h2>
      <div class="store-preview-card">
        <div class="store-card-header">
          <div class="store-logo-placeholder">${esc((s.name || 'S')[0])}</div>
          <div>
            <b style="font-size:15px">${esc(s.name)}</b>
            <div class="page-sub" style="font-size:12px">${esc(s.category)}</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:13px">
          <div style="margin-bottom:4px"><span style="color:var(--ink-faint)">Address:</span> ${esc(s.address)}</div>
          ${s.hours ? `<div style="margin-bottom:4px"><span style="color:var(--ink-faint)">Hours:</span> ${esc(s.hours)}</div>` : ''}
          ${s.contact ? `<div><span style="color:var(--ink-faint)">Contact:</span> ${esc(s.contact)}</div>` : ''}
        </div>
        ${(s.offers || []).length > 0 ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin-bottom:6px">Current Offers</div>
            ${s.offers.map(of => `<div class="chip ok" style="margin:2px 4px 2px 0;font-size:11px">${esc(of.title)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Save store details
  container.querySelector('#f-store-edit').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/store/profile', { method: 'PUT', body: Object.fromEntries(fd) });
      toast('Store details saved.');
      VIEWS['store-owner-dashboard'](container);
    } catch (e) { toast(e.message, 'err'); }
  };

  // Add offer
  container.querySelector('#add-offer-btn').onclick = () => {
    const m = openModal(`
      <h2>Add Offer / Promotion</h2>
      <form id="f-offer">
        <label>Offer Title</label>
        <input name="title" required placeholder="e.g. 20% off on all supplements">
        <div class="mt"></div>
        <label>Description (optional)</label>
        <textarea name="description" rows="2" placeholder="Details about the offer..."></textarea>
        <div class="mt"></div>
        <label>Valid Till (optional)</label>
        <input name="validTill" type="date">
        <div class="row mt" style="justify-content:flex-end">
          <button class="btn secondary" type="button" id="offer-cancel">Cancel</button>
          <button class="btn" type="submit">Add Offer</button>
        </div>
      </form>
    `);
    m.el.querySelector('#offer-cancel').onclick = m.close;
    m.el.querySelector('#f-offer').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const offers = [...(s.offers || []), Object.fromEntries(fd)];
      try {
        await api('/api/store/offers', { method: 'PUT', body: { offers } });
        toast('Offer added.');
        m.close();
        VIEWS['store-owner-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); }
    };
  };

  // Remove offer
  container.querySelectorAll('[data-remove-offer]').forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.removeOffer);
      const offers = (s.offers || []).filter((_, i) => i !== idx);
      try {
        await api('/api/store/offers', { method: 'PUT', body: { offers } });
        toast('Offer removed.');
        VIEWS['store-owner-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); }
    };
  });

  // Logout
  container.querySelector('#store-logout').onclick = async () => {
    await api('/api/store/auth/logout', { method: 'POST' });
    App.storeOwner = null;
    location.hash = '#/store-owner/login';
    App.routeStoreOwner();
  };
};
