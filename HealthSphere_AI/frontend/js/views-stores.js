/* ---------- Patient Store Directory View ---------- */

VIEWS.stores = async function (container) {
  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Medical Store Directory</h1>
        <div class="page-sub">Find pharmacies, medical shops, and healthcare stores near you</div>
      </div>
    </div>

    <div class="card mb">
      <div class="store-search-bar">
        <div class="store-search-row">
          <div class="store-search-field" style="flex:2">
            <label>Search</label>
            <input id="store-search" placeholder="Search by name, medicine, or service...">
          </div>
          <div class="store-search-field" style="flex:1.5">
            <label>Location</label>
            <div style="display:flex;gap:6px">
              <input id="store-location" placeholder="City or area..." style="flex:1">
              <button class="btn sm" id="use-location-btn" title="Use my current location" style="white-space:nowrap;flex-shrink:0">Use My Location</button>
            </div>
          </div>
          <div class="store-search-field" style="flex:0.8">
            <label>Category</label>
            <select id="store-cat-filter">
              <option value="all">All Types</option>
              <option value="Pharmacy">Pharmacy</option>
              <option value="Diagnostic Lab">Diagnostic Lab</option>
              <option value="Medical Equipment">Medical Equipment</option>
              <option value="Ayurvedic Store">Ayurvedic</option>
              <option value="Homeopathy Store">Homeopathy</option>
              <option value="Surgical Supply">Surgical</option>
              <option value="Optical Store">Optical</option>
              <option value="Health Supplement">Supplements</option>
            </select>
          </div>
          <div class="store-search-field" style="flex:0;align-self:flex-end">
            <button class="btn" id="search-location-btn">Search</button>
          </div>
        </div>
      </div>
    </div>

    <div id="store-loading" style="display:none;text-align:center;padding:40px">
      <div class="spin" style="width:28px;height:28px;border-width:3px"></div>
      <div style="margin-top:12px;font-size:13px;color:var(--ink-soft)" id="loading-text">Finding stores...</div>
    </div>
    <div id="store-results"></div>
  `;

  const resultsEl = container.querySelector('#store-results');
  const loadingEl = container.querySelector('#store-loading');
  const loadingText = container.querySelector('#loading-text');
  let userLat = null, userLng = null;

  function showLoading(msg) {
    loadingEl.style.display = 'block';
    loadingText.textContent = msg || 'Finding stores...';
    resultsEl.innerHTML = '';
  }
  function hideLoading() { loadingEl.style.display = 'none'; }

  function renderStores(stores, meta = {}) {
    hideLoading();
    if (stores.length === 0) {
      renderEmpty();
      return;
    }

    const registered = stores.filter(s => s.source === 'registered');
    const nearby = stores.filter(s => s.source === 'osm');

    let html = '';

    const originLabel = meta.origin?.label || (meta.origin ? `${meta.origin.lat.toFixed(2)}, ${meta.origin.lng.toFixed(2)}` : '');
    html += `<div class="store-stats-bar">
      <div class="store-stats">
        <span class="store-stat"><b>${stores.length}</b> stores found</span>
        ${registered.length ? `<span class="store-stat ok"><b>${registered.length}</b> Registered</span>` : ''}
        ${nearby.length ? `<span class="store-stat info"><b>${nearby.length}</b> Nearby</span>` : ''}
        ${originLabel ? `<span class="store-stat faint">${esc(originLabel)}</span>` : ''}
      </div>
    </div>`;

    if (registered.length > 0) {
      html += `
        <div class="store-section">
          <div class="store-section-header">
            <div class="store-section-title">
              <h3>Registered on HealthSphere</h3>
              <span class="chip ok">${registered.length}</span>
            </div>
            <div class="page-sub">Verified stores with full profiles, offers, and direct contact</div>
          </div>
          <div class="store-grid">${registered.map(s => storeCard(s, true)).join('')}</div>
        </div>`;
    }

    if (nearby.length > 0) {
      html += `
        <div class="store-section">
          <div class="store-section-header">
            <div class="store-section-title">
              <h3>Nearby Pharmacies & Stores</h3>
              <span class="chip info">${nearby.length}</span>
            </div>
            <div class="page-sub">Sourced from OpenStreetMap -- click for directions</div>
          </div>
          <div class="store-grid">${nearby.map(s => storeCard(s, false)).join('')}</div>
        </div>`;
    }

    resultsEl.innerHTML = html;
    bindButtons();
  }

  function renderEmpty() {
    const cities = ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Kochi'];
    resultsEl.innerHTML = `
      <div class="store-empty-state">
        <div class="store-empty-title">No stores found</div>
        <p>Try a different search term, change the category filter, or browse stores by city:</p>
        <div class="store-city-grid">
          ${cities.map(c => `
            <button class="store-city-btn city-chip" data-city="${c}">
              <span class="store-city-name">${esc(c)}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
    bindCityChips();
  }

  function storeCard(s, isReg) {
    const initial = (s.name || 'S')[0].toUpperCase();
    const distLabel = s.distanceKm != null ? `${s.distanceKm} km` : '';
    const phoneNum = (s.contact || '').replace(/[^0-9+]/g, '');
    const hasCoords = s.lat && s.lng;

    return `
      <div class="store-card hoverable" data-store-id="${s.id}">
        <div class="store-card-header">
          <div class="store-logo-placeholder" style="${isReg ? '' : 'background:linear-gradient(135deg,#2563eb,#1d4ed8)'}">
            ${initial}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:650;line-height:1.3">${esc(s.name)}</div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:3px;flex-wrap:wrap">
              <span class="chip ${isReg ? 'ok' : 'info'}" style="font-size:9px">${isReg ? 'Verified' : 'Community'}</span>
              <span class="chip neutral" style="font-size:9px">${esc(s.category)}</span>
              ${distLabel ? `<span style="font-size:11px;color:var(--primary);font-weight:600">${distLabel}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="store-card-body">
          <div class="store-info-row"><span class="store-info-label">Address</span> <span>${esc(s.address)}</span></div>
          ${s.hours && s.hours !== 'Hours not listed' ? `<div class="store-info-row"><span class="store-info-label">Hours</span> <span>${esc(s.hours)}</span></div>` : ''}
          ${s.contact ? `<div class="store-info-row"><span class="store-info-label">Contact</span> <span>${esc(s.contact)}</span></div>` : ''}
          ${s.services && s.services.length ? `
            <div class="store-services">
              ${s.services.slice(0, 4).map(sv => `<span class="chip neutral" style="font-size:9px">${esc(sv)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        ${(s.offers || []).length > 0 ? `
          <div class="store-offers">
            <div class="store-offers-label">Active Offers</div>
            ${s.offers.slice(0, 2).map(of => `<span class="chip ok" style="font-size:10px">${esc(of.title)}</span>`).join('')}
          </div>
        ` : ''}

        <div class="store-card-actions">
          ${phoneNum ? `<a class="btn sm secondary" href="tel:${esc(phoneNum)}" onclick="(async()=>{try{await fetch('/api/stores/${s.id}/click',{method:'POST'})}catch{}})()">Call</a>` : ''}
          ${hasCoords ? `<a class="btn sm ghost" href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" onclick="(async()=>{try{await fetch('/api/stores/${s.id}/click',{method:'POST'})}catch{}})()">Directions</a>` : ''}
          ${s.osmLink ? `<a class="btn sm ghost" href="${esc(s.osmLink)}" target="_blank">OpenStreetMap</a>` : ''}
          ${isReg ? `<button class="btn sm ghost" data-store-detail="${s.id}">Details</button>` : ''}
        </div>
      </div>`;
  }

  async function fetchStores(lat, lng, place, q, category) {
    showLoading(place ? `Searching in ${place}...` : 'Finding nearby stores...');
    try {
      const params = new URLSearchParams();
      if (lat != null) params.set('lat', lat);
      if (lng != null) params.set('lng', lng);
      if (place) params.set('place', place);
      if (q) params.set('q', q);
      if (category && category !== 'all') params.set('category', category);
      const r = await api(`/api/stores?${params.toString()}`);
      const stores = r.stores || [];
      if (stores.length > 0) {
        renderStores(stores, { origin: r.origin });
      } else {
        renderEmpty();
      }
    } catch (e) {
      if (!resultsEl.innerHTML.trim()) {
        hideLoading();
        renderEmpty();
      } else {
        hideLoading();
      }
    }
  }

  async function fetchByCity(city) {
    showLoading(`Loading stores in ${city}...`);
    try {
      const cat = container.querySelector('#store-cat-filter').value;
      const params = new URLSearchParams();
      if (cat && cat !== 'all') params.set('category', cat);
      const r = await api(`/api/stores/city/${encodeURIComponent(city)}?${params.toString()}`);
      renderStores(r.stores || [], { origin: r.origin ? { ...r.origin, label: r.city } : null });
    } catch (e) {
      hideLoading();
      renderEmpty();
    }
  }

  function bindButtons() {
    resultsEl.querySelectorAll('[data-store-detail]').forEach(btn => {
      btn.onclick = async () => {
        try {
          const r = await api(`/api/stores/${btn.dataset.storeDetail}`);
          const s = r.store;
          const initial = (s.name || 'S')[0].toUpperCase();
          openModal(`
            <div class="spread">
              <div class="row" style="align-items:center">
                <div class="store-logo-placeholder" style="width:48px;height:48px;font-size:20px">${initial}</div>
                <div>
                  <h2 style="margin-bottom:2px">${esc(s.name)}</h2>
                  <span class="chip ok">${esc(s.category)}</span>
                </div>
              </div>
            </div>
            <div style="margin-top:16px;font-size:13.5px;line-height:1.8">
              <div><b>Address:</b> ${esc(s.address)}</div>
              ${s.hours ? `<div><b>Hours:</b> ${esc(s.hours)}</div>` : ''}
              ${s.contact ? `<div><b>Contact:</b> ${esc(s.contact)}</div>` : ''}
            </div>
            ${(s.offers || []).length > 0 ? `
              <div style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--line)">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:700;margin-bottom:8px">Current Offers</div>
                ${s.offers.map(of => `
                  <div style="padding:8px 0;border-bottom:1px solid var(--line)">
                    <b style="font-size:13px">${esc(of.title)}</b>
                    ${of.description ? `<div style="font-size:12px;color:var(--ink-soft);margin-top:2px">${esc(of.description)}</div>` : ''}
                    ${of.validTill ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:2px">Valid till: ${esc(of.validTill)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
            <div class="row mt" style="justify-content:flex-end">
              ${s.contact ? `<a class="btn secondary" href="tel:${esc((s.contact || '').replace(/[^0-9+]/g, ''))}">Call Store</a>` : ''}
              ${s.lat && s.lng ? `<a class="btn" href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank">Get Directions</a>` : ''}
              <button class="btn ghost" onclick="this.closest('.modal-backdrop').click()">Close</button>
            </div>
          `, { wide: true });
          try { await api(`/api/stores/${s.id}/click`, { method: 'POST' }); } catch {}
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  }

  function bindCityChips() {
    resultsEl.querySelectorAll('.city-chip').forEach(btn => {
      btn.onclick = () => {
        container.querySelector('#store-location').value = btn.dataset.city;
        fetchByCity(btn.dataset.city);
      };
    });
  }

  container.querySelector('#search-location-btn').onclick = () => {
    const q = container.querySelector('#store-search').value;
    const cat = container.querySelector('#store-cat-filter').value;
    const place = container.querySelector('#store-location').value;
    if (place && !userLat) {
      fetchStores(null, null, place, q || null, cat);
    } else {
      fetchStores(userLat, userLng, place || null, q || null, cat);
    }
  };

  container.querySelector('#store-search').onkeydown = e => {
    if (e.key === 'Enter') container.querySelector('#search-location-btn').click();
  };

  container.querySelector('#store-cat-filter').onchange = () => {
    container.querySelector('#search-location-btn').click();
  };

  container.querySelector('#use-location-btn').onclick = () => {
    if (!navigator.geolocation) { toast('Geolocation not supported by your browser.', 'err'); return; }
    showLoading('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        container.querySelector('#store-location').value = '';
        const q = container.querySelector('#store-search').value;
        const cat = container.querySelector('#store-cat-filter').value;
        fetchStores(userLat, userLng, null, q || null, cat);
      },
      () => {
        hideLoading();
        toast('Location access denied. Try searching by city name instead.', 'err');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  fetchStores(null, null, null, null, 'all');

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        showLoading('Finding closer stores near you...');
        fetchStores(userLat, userLng, null, null, 'all');
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  }
};
