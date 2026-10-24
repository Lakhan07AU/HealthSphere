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

  const catOptions = ['Pharmacy','Medical Equipment','Ayurvedic Store','Homeopathy Store','Surgical Supply','Optical Store','Health Supplement','Diagnostic Lab'];

  const renderProducts = (products) => {
    const list = products || [];
    if (list.length === 0) {
      return '<div class="empty" style="margin-top:12px">No products added yet. Add medicines/items to build your e-commerce catalogue.</div>';
    }
    return `
      <div class="table-wrap" style="margin-top:12px;overflow:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Price (₹)</th>
              <th>MRP (₹)</th>
              <th>Stock</th>
              <th>Unit</th>
              <th>Rx</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p, idx) => `
              <tr>
                <td>
                  <div style="font-weight:600">${esc(p.name)}</div>
                  ${p.description ? `<div style="font-size:11.5px;color:var(--ink-soft)">${esc(p.description)}</div>` : ''}
                </td>
                <td>${esc(p.category || '')}</td>
                <td>₹${Number(p.price || 0).toFixed(0)}</td>
                <td>${p.mrp ? '₹' + Number(p.mrp).toFixed(0) : '—'}</td>
                <td>${Number(p.stock || 0)}</td>
                <td>${esc(p.unit || 'pcs')}</td>
                <td>${p.requiresPrescription ? '<span class="chip warn">Rx</span>' : '<span class="chip">OTC</span>'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn sm secondary" data-edit-prod="${p.id}">Edit</button>
                  <button class="btn sm danger-outline" data-del-prod="${p.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  };

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
      <div class="card stat"><b>${(s.products || []).length}</b><span>Products/Medicines</span></div>
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
            ${catOptions.map(c => `<option value="${c}" ${s.category === c ? 'selected' : ''}>${c}</option>`).join('')}
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
      <div class="spread">
        <div>
          <h2>Medicine & Product Catalogue (e-commerce)</h2>
          <div class="page-sub">Manage your real inventory — add, edit, update stock/prices. Patients see this in the store directory.</div>
        </div>
        <button class="btn" id="add-prod-btn">Add Product / Medicine</button>
      </div>
      <div id="prod-list">${renderProducts(s.products || [])}</div>
    </div>

    <div class="card mt">
      <h2>Preview — How patients see your store</h2>
      <div class="store-preview-card">
        <div class="store-card-header">
          <div class="store-logo-placeholder">${esc((s.name || 'S')[0])}</div>
          <div>
            <b style="font-size:15px">${esc(s.name)}</b>
            <div class="page-sub" style="font-size:12px">${esc(s.category)} · ${(s.products||[]).length} items</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:13px">
          <div style="margin-bottom:4px"><span style="color:var(--ink-faint)">Address:</span> ${esc(s.address)}</div>
          ${s.hours ? `<div style="margin-bottom:4px"><span style="color:var(--ink-faint)">Hours:</span> ${esc(s.hours)}</div>` : ''}
          ${s.contact ? `<div><span style="color:var(--ink-faint)">Contact:</span> ${esc(s.contact)}</div>` : ''}
        </div>
        ${(s.products || []).length > 0 ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin-bottom:6px">Top products</div>
            ${(s.products||[]).slice(0,4).map(pr => `<span class="chip" style="margin:2px 4px 2px 0;font-size:11px">${esc(pr.name)} · ₹${Number(pr.price||0).toFixed(0)}</span>`).join('')}
            ${(s.products||[]).length>4?`<span class="chip" style="margin:2px 4px 2px 0;font-size:11px">+${(s.products||[]).length-4} more</span>`:''}
          </div>
        ` : ''}
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
          <button class="btn secondary" type="button" id="offer-calk">Cancel</button>
          <button class="btn" type="submit">Add Offer</button>
        </div>
      </form>
    `);
    m.el.querySelector('#offer-calk').onclick = m.close;
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

  // Product CRUD
  const openProductModal = (prod) => {
    const editing = !!prod;
    const m = openModal(`
      <h2>${editing ? 'Edit Product / Medicine' : 'Add Product / Medicine'}</h2>
      <form id="f-prod">
        <div class="grid g2">
          <div>
            <label>Product Name *</label>
            <input name="name" required value="${esc(prod && prod.name ? prod.name : '')}" placeholder="e.g. Paracetamol 500mg">
          </div>
          <div>
            <label>Category *</label>
            <input name="category" required value="${esc(prod && prod.category ? prod.category : '')}" placeholder="e.g. Pain Relief / Antibiotics / Devices">
          </div>
        </div>
        <div class="mt"></div>
        <label>Description</label>
        <textarea name="description" rows="2" placeholder="Short description for patients">${esc(prod && prod.description ? prod.description : '')}</textarea>
        <div class="mt"></div>
        <div class="grid g4">
          <div>
            <label>Price (₹) *</label>
            <input name="price" type="number" min="0" step="0.01" required value="${prod ? prod.price : ''}">
          </div>
          <div>
            <label>MRP (₹)</label>
            <input name="mrp" type="number" min="0" step="0.01" value="${prod && prod.mrp ? prod.mrp : ''}">
          </div>
          <div>
            <label>Stock</label>
            <input name="stock" type="number" min="0" step="1" value="${prod ? prod.stock : 0}">
          </div>
          <div>
            <label>Unit</label>
            <input name="unit" value="${esc(prod && prod.unit ? prod.unit : 'pcs')}" placeholder="strip / bottle / box / pcs">
          </div>
        </div>
        <div class="row mt" style="align-items:center;gap:12px;flex-wrap:wrap">
          <label class="row" style="align-items:center;gap:8px"><input type="checkbox" name="requiresPrescription" ${prod && prod.requiresPrescription ? 'checked' : ''}> Requires Prescription (Rx)</label>
          <label>Tags (comma separated)</label>
          <input name="tags" style="flex:1;min-width:200px" value="${esc(prod && Array.isArray(prod.tags) ? prod.tags.join(', ') : '')}" placeholder="fever, pain">
        </div>
        <div class="row mt" style="justify-content:flex-end">
          <button class="btn secondary" type="button" id="prod-calk">Cancel</button>
          <button class="btn" type="submit">${editing ? 'Save Changes' : 'Add Product'}</button>
        </div>
      </form>
    `);
    m.el.querySelector('#prod-calk').onclick = m.close;
    m.el.querySelector('#f-prod').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd);
      body.price = Number(body.price) || 0;
      body.mrp = Number(body.mrp) || 0;
      body.stock = Number(body.stock) || 0;
      body.requiresPrescription = !!fd.get('requiresPrescription');
      body.tags = String(body.tags || '').split(',').map(t=>t.trim()).filter(Boolean);
      try {
        if (editing) {
          await api(`/api/store/products/${prod.id}`, { method: 'PUT', body });
          toast('Product updated.');
        } else {
          await api('/api/store/products', { method: 'POST', body });
          toast('Product added.');
        }
        m.close();
        VIEWS['store-owner-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); }
    };
  };

  container.querySelector('#add-prod-btn').onclick = () => openProductModal(null);
  container.querySelector('#prod-list').onclick = async (e) => {
    const editBtn = e.target.closest('[data-edit-prod]');
    if (editBtn) {
      const pid = editBtn.dataset.editProd;
      const prod = (s.products || []).find(p => p.id === pid);
      if (prod) openProductModal(prod);
      return;
    }
    const delBtn = e.target.closest('[data-del-prod]');
    if (delBtn) {
      const pid = delBtn.dataset.delProd;
      const okd = await confirmDlg('Delete product', 'This medicine/item will be removed from your catalogue. Continue?');
      if (!okd) return;
      try {
        await api(`/api/store/products/${pid}`, { method: 'DELETE' });
        toast('Product deleted.');
        VIEWS['store-owner-dashboard'](container);
      } catch (e) { toast(e.message, 'err'); }
    }
  };

  // Logout
  container.querySelector('#store-logout').onclick = async () => {
    await api('/api/store/auth/logout', { method: 'POST' });
    App.storeOwner = null;
    location.hash = '#/store-owner/login';
    App.routeStoreOwner();
  };
};
