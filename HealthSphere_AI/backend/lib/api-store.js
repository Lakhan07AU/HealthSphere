import crypto from 'node:crypto';
import { db, persist } from './db.js';
import { hashPassword, verifyPassword, audit, parseToken } from './auth.js';
import { loginRateLimit } from './ratelimit.js';
import { uid, haversine } from './util.js';
import { fetchNearbyLive, geocodePlace, FACILITIES, CITIES } from './hospitals.js';

/* ==================== STORE OWNER AUTH & API ROUTES ==================== */

export const storeRoutes = [];
const route = (method, pattern, handler, opts = {}) => storeRoutes.push({ method, pattern, handler, opts });

const ok = (res, data) => send(res, 200, data);
const bad = (res, err, status = 400) => send(res, status, { error: String(err.message || err) });

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ---------- Store Owner Auth ---------- */
function issueStoreSession(ownerId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    token, userId: ownerId, role: 'store-owner',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  });
  if (db.sessions.length > 500) db.sessions = db.sessions.slice(-300);
  persist();
  return token;
}

function getAuthedStoreOwner(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
    })
  );
  let token = cookies.hs_token;
  const authz = req.headers.authorization || '';
  if (!token && authz.startsWith('Bearer ')) token = authz.slice(7);
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  if (session.role !== 'store-owner') return null;
  return db.storeOwnerAccounts.find(o => o.id === session.userId) || null;
}

route('POST', /^\/api\/store\/auth\/register$/, (req, res, p) => {
  try {
    const b = p.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const ownerName = String(b.ownerName || '').trim();
    const storeName = String(b.storeName || '').trim();
    const password = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (!ownerName) throw new Error('Owner name is required.');
    if (!storeName) throw new Error('Store name is required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!b.licenseNumber) throw new Error('Store license/registration number is required.');
    if (!b.address) throw new Error('Store address is required.');
    if (db.storeOwnerAccounts.some(o => o.email === email)) throw new Error('An account with this email already exists.');

    const { salt, hash } = hashPassword(password);
    const owner = {
      id: uid('storeown'), email, ownerName, storeName, passwordSalt: salt, passwordHash: hash,
      licenseNumber: b.licenseNumber, address: b.address,
      contact: b.contact || '', hours: b.hours || '', photos: [],
      verificationStatus: 'pending', createdAt: new Date().toISOString()
    };
    db.storeOwnerAccounts.push(owner);

    const store = {
      id: uid('store'), ownerId: owner.id, name: storeName,
      category: b.category || 'Pharmacy', address: b.address,
      lat: b.lat != null ? Number(b.lat) : null,
      lng: b.lng != null ? Number(b.lng) : null,
      hours: b.hours || '', contact: b.contact || '',
      photos: [], logo: '', offers: [], products: [], status: 'pending',
      views: 0, clicks: 0, createdAt: new Date().toISOString()
    };
    db.stores.push(store);
    owner.storeId = store.id;
    persist();

    const token = issueStoreSession(owner.id);
    res.setHeader('Set-Cookie', `hs_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
    ok(res, { owner: pubOwner(owner), store, token });
  } catch (e) { bad(res, e); }
}, { auth: false });

route('POST', /^\/api\/store\/auth\/login$/, (req, res, p) => {
  const { allowed, retryAfterSec } = loginRateLimit(p.req);
  if (!allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSec) });
    res.end(JSON.stringify({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }));
    return;
  }
  try {
    const b = p.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const owner = db.storeOwnerAccounts.find(o => o.email === email);
    if (!owner || !verifyPassword(String(b.password || ''), owner.passwordSalt, owner.passwordHash)) {
      throw new Error('Invalid email or password.');
    }
    const token = issueStoreSession(owner.id);
    const store = db.stores.find(s => s.ownerId === owner.id);
    res.setHeader('Set-Cookie', `hs_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
    ok(res, { owner: pubOwner(owner), store, token });
  } catch (e) { bad(res, e, 401); }
}, { auth: false });

route('POST', /^\/api\/store\/auth\/logout$/, (req, res, p) => {
  const token = parseToken(p.req);
  if (token) { db.sessions = db.sessions.filter(s => s.token !== token); persist(); }
  res.setHeader('Set-Cookie', 'hs_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  ok(res, { ok: true });
}, { auth: false });

route('GET', /^\/api\/store\/me$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  ok(res, { owner: pubOwner(owner), store });
});

/* ---------- Store Profile Management ---------- */
route('PUT', /^\/api\/store\/profile$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const b = p.body || {};
  if (b.storeName) { store.name = b.storeName; owner.storeName = b.storeName; }
  if (b.category) store.category = b.category;
  if (b.address) { store.address = b.address; owner.address = b.address; }
  if (b.hours) { store.hours = b.hours; owner.hours = b.hours; }
  if (b.contact) { store.contact = b.contact; owner.contact = b.contact; }
  if (b.lat != null) store.lat = Number(b.lat);
  if (b.lng != null) store.lng = Number(b.lng);
  persist();
  ok(res, { store });
});

route('PUT', /^\/api\/store\/offers$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const b = p.body || {};
  if (Array.isArray(b.offers)) store.offers = b.offers;
  persist();
  ok(res, { offers: store.offers });
});

/* ---------- Store Products / Inventory Management ---------- */
route('GET', /^\/api\/store\/products$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  ok(res, { products: store.products || [] });
});

route('POST', /^\/api\/store\/products$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const b = p.body || {};
  const product = {
    id: uid('prod'),
    name: String(b.name || '').trim(),
    category: String(b.category || '').trim(),
    description: String(b.description || '').trim(),
    price: Number(b.price) || 0,
    mrp: Number(b.mrp) || 0,
    stock: Number(b.stock) || 0,
    unit: String(b.unit || 'pcs').trim(),
    requiresPrescription: Boolean(b.requiresPrescription),
    tags: Array.isArray(b.tags) ? b.tags : [],
    image: String(b.image || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!product.name) return bad(res, new Error('Product name is required.'));
  if (!product.category) return bad(res, new Error('Category is required.'));
  store.products = store.products || [];
  store.products.push(product);
  persist();
  ok(res, { product });
});

route('PUT', /^\/api\/store\/products\/([\w-]+)$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const productId = p.params[0];
  const idx = (store.products || []).findIndex(pr => pr.id === productId);
  if (idx === -1) return bad(res, new Error('Product not found.'), 404);
  const b = p.body || {};
  const product = store.products[idx];
  product.name = String(b.name || product.name).trim();
  product.category = String(b.category || product.category).trim();
  product.description = String(b.description || product.description).trim();
  product.price = Number(b.price) ?? product.price;
  product.mrp = Number(b.mrp) ?? product.mrp;
  product.stock = Number(b.stock) ?? product.stock;
  product.unit = String(b.unit || product.unit).trim();
  product.requiresPrescription = b.requiresPrescription !== undefined ? Boolean(b.requiresPrescription) : product.requiresPrescription;
  product.tags = Array.isArray(b.tags) ? b.tags : product.tags;
  product.image = String(b.image || product.image).trim();
  product.updatedAt = new Date().toISOString();
  persist();
  ok(res, { product });
});

route('DELETE', /^\/api\/store\/products\/([\w-]+)$/, (req, res, p) => {
  const owner = getAuthedStoreOwner(p.req);
  if (!owner) return bad(res, new Error('Please sign in as a store owner.'), 401);
  const store = db.stores.find(s => s.ownerId === owner.id);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  const productId = p.params[0];
  store.products = (store.products || []).filter(pr => pr.id !== productId);
  persist();
  ok(res, { ok: true });
});

/* ---------- Public Store Products (for patients to browse) ---------- */
route('GET', /^\/api\/stores\/([\w-]+)\/products$/, (req, res, p) => {
  const store = db.stores.find(s => s.id === p.params[0] && s.status === 'approved');
  if (!store) return bad(res, new Error('Store not found.'), 404);
  ok(res, { products: store.products || [] });
});

/* ---------- Public Store Directory (registered + OSM live + sample fallback) ---------- */
route('GET', /^\/api\/stores$/, async (req, res, p) => {
  const q = p.query || {};
  let registered = db.stores.filter(s => s.status === 'approved');

  // Filter registered stores
  if (q.category && q.category !== 'all') {
    registered = registered.filter(s => s.category.toLowerCase() === q.category.toLowerCase());
  }
  if (q.q) {
    const search = q.q.toLowerCase();
    registered = registered.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.address.toLowerCase().includes(search) ||
      s.category.toLowerCase().includes(search)
    );
  }

  const result = registered.map(s => ({
    id: s.id, name: s.name, category: s.category, address: s.address,
    lat: s.lat, lng: s.lng, hours: s.hours, contact: s.contact,
    photos: s.photos, logo: s.logo, offers: s.offers, views: s.views,
    source: 'registered', distanceKm: null
  }));

  // If lat/lng provided, fetch live OSM pharmacies nearby + sample fallback
  let lat = q.lat ? parseFloat(q.lat) : null;
  let lng = q.lng ? parseFloat(q.lng) : null;
  let originLabel = '';

  // Geocode a place name if provided (even without lat/lng)
  if (q.place && (lat == null || lng == null)) {
    try {
      const g = await geocodePlace(q.place);
      lat = g.lat; lng = g.lng;
      originLabel = g.label || q.place;
    } catch { /* skip */ }
  }

  // If we have a place name but already have coords, still try to geocode for better accuracy
  if (q.place && lat != null && lng != null) {
    try {
      const g = await geocodePlace(q.place);
      lat = g.lat; lng = g.lng;
      originLabel = g.label || q.place;
    } catch { /* use provided coords */ }
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    let osmResults = [];

    // Try live OpenStreetMap first
    try {
      osmResults = await fetchNearbyLive({
        lat, lng, type: 'pharmacy', q: q.q || '', radiusM: 8000, maxResults: 30
      });
      // Also get clinics/labs
      try {
        const more = await fetchNearbyLive({
          lat, lng, type: 'all', q: q.q || '', radiusM: 8000, maxResults: 30
        });
        for (const f of more) {
          if (!osmResults.some(x => x.name === f.name && Math.abs((x.distanceKm || 0) - (f.distanceKm || 0)) < 0.05)) {
            osmResults.push(f);
          }
        }
      } catch { /* ok */ }
    } catch {
      // OSM unavailable — fall back to bundled sample data
      osmResults = FACILITIES.filter(f => f.type === 'pharmacy' || f.type === 'clinic' || f.type === 'lab')
        .map(f => ({
          ...f,
          distanceKm: Math.round(haversine(lat, lng, f.lat, f.lng) * 10) / 10
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 30);
    }

    // Filter by category if specified
    let osmFiltered = osmResults;
    if (q.category && q.category !== 'all') {
      const catLower = q.category.toLowerCase();
      osmFiltered = osmResults.filter(f => {
        if (catLower === 'pharmacy') return f.type === 'pharmacy';
        if (catLower === 'medical equipment' || catLower === 'surgical supply') return f.type === 'clinic';
        if (catLower === 'diagnostic lab') return f.type === 'lab';
        return f.type === 'pharmacy' || f.type === 'clinic' || f.type === 'lab';
      });
    }

    // Tag results and merge
    for (const f of osmFiltered) {
      const categoryLabel = f.type === 'pharmacy' ? 'Pharmacy'
        : f.type === 'lab' ? 'Diagnostic Lab'
        : f.type === 'hospital' ? 'Hospital'
        : f.type === 'emergency' ? 'Emergency Care'
        : 'Medical Store';
      result.push({
        id: f.id || `sample_${f.name.replace(/\s/g, '_')}`,
        name: f.name, category: categoryLabel,
        address: f.address || 'Address not listed',
        lat: f.lat, lng: f.lng,
        hours: f.hours || 'Hours not listed',
        contact: f.phone || '',
        photos: [], logo: '', offers: [],
        views: 0, source: 'osm',
        distanceKm: f.distanceKm != null ? f.distanceKm : null,
        osmLink: f.osm || null, services: f.services || []
      });
    }

    // Sort by distance
    result.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    });
  } else {
    // No coordinates — show sample pharmacies from nearest/default city
    const samplePharmacies = FACILITIES.filter(f => f.type === 'pharmacy')
      .slice(0, 12);
    for (const f of samplePharmacies) {
      if (q.category && q.category !== 'all') {
        const catLower = q.category.toLowerCase();
        if (catLower !== 'pharmacy') continue;
      }
      if (q.q) {
        const search = q.q.toLowerCase();
        if (!f.name.toLowerCase().includes(search) && !f.address.toLowerCase().includes(search)) continue;
      }
      result.push({
        id: f.id, name: f.name, category: 'Pharmacy',
        address: `${f.area || ''}, ${f.city || ''}`.trim() || f.address,
        lat: f.lat, lng: f.lng, hours: f.hours, contact: f.phone,
        photos: [], logo: '', offers: [],
        views: 0, source: 'osm', distanceKm: null,
        osmLink: null, services: f.services || [],
        city: f.city
      });
    }
  }

  ok(res, {
    stores: result.slice(0, 50),
    registeredCount: registered.length,
    liveOsmCount: result.filter(s => s.source === 'osm').length,
    cities: CITIES.map(c => c.name),
    origin: lat != null && lng != null ? { lat, lng, label: originLabel || '' } : null
  });
});

route('GET', /^\/api\/stores\/(?!city\/)([\w-]+)$/, (req, res, p) => {
  const store = db.stores.find(s => s.id === p.params[0] && s.status === 'approved');
  if (!store) return bad(res, new Error('Store not found.'), 404);
  store.views = (store.views || 0) + 1;
  persist();
  ok(res, {
    store: {
      id: store.id, name: store.name, category: store.category, address: store.address,
      lat: store.lat, lng: store.lng, hours: store.hours, contact: store.contact,
      photos: store.photos, logo: store.logo, offers: store.offers
    }
  });
});

route('POST', /^\/api\/stores\/([\w-]+)\/click$/, (req, res, p) => {
  const store = db.stores.find(s => s.id === p.params[0]);
  if (!store) return bad(res, new Error('Store not found.'), 404);
  store.clicks = (store.clicks || 0) + 1;
  persist();
  ok(res, { ok: true });
});

/* ---------- Geocode helper ---------- */
route('GET', /^\/api\/geocode$/, async (req, res, p) => {
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams);
  if (!q.place) return bad(res, new Error('place parameter required.'));
  try {
    const g = await geocodePlace(q.place);
    ok(res, g);
  } catch (e) { bad(res, e); }
});

/* ---------- City browse: get sample pharmacies by city name ---------- */
route('GET', /^\/api\/stores\/city\/([\w\s-]+)$/, (req, res, p) => {
  const cityName = decodeURIComponent(p.params[0]).trim();
  const city = CITIES.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  if (!city) return bad(res, new Error('City not found. Available: ' + CITIES.map(c => c.name).join(', ')));

  const q = p.query || {};
  let facilities = FACILITIES.filter(f => f.city === city.name && (f.type === 'pharmacy' || f.type === 'clinic' || f.type === 'lab'));

  if (q.category && q.category !== 'all') {
    const catLower = q.category.toLowerCase();
    facilities = facilities.filter(f => {
      if (catLower === 'pharmacy') return f.type === 'pharmacy';
      if (catLower === 'diagnostic lab') return f.type === 'lab';
      return true;
    });
  }

  ok(res, {
    city: city.name,
    origin: { lat: city.lat, lng: city.lng },
    stores: facilities.map(f => ({
      id: f.id, name: f.name,
      category: f.type === 'pharmacy' ? 'Pharmacy' : f.type === 'lab' ? 'Diagnostic Lab' : 'Medical Store',
      address: `${f.area || ''}, ${f.city}`.trim(),
      lat: f.lat, lng: f.lng, hours: f.hours, contact: f.phone,
      photos: [], logo: '', offers: [], views: 0,
      source: 'osm', distanceKm: null,
      services: f.services || []
    }))
  });
});

/* ---------- helpers ---------- */
function pubOwner(o) {
  return {
    id: o.id, email: o.email, ownerName: o.ownerName, storeName: o.storeName,
    licenseNumber: o.licenseNumber, address: o.address, contact: o.contact,
    hours: o.hours, verificationStatus: o.verificationStatus,
    storeId: o.storeId, createdAt: o.createdAt
  };
}
