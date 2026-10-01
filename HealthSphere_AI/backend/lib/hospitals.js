import { haversine } from './util.js';

/* ---------------- Nearby healthcare discovery (PRD 8.19) ----------------
   Bundled demo dataset — swap for a maps/places API in production.
   Location use is always opt-in via explicit user permission. */

export const CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Kochi', lat: 9.9312, lng: 76.2673 }
];

let idc = 0;
const F = (city, name, type, area, address, phone, hours, services) => {
  const c = CITIES.find(x => x.name === city);
  return {
    id: `fac_${++idc}`, name, type, city,
    lat: +(c.lat + (Math.random() - 0.5) * 0.14).toFixed(5),
    lng: +(c.lng + (Math.random() - 0.5) * 0.14).toFixed(5),
    address: `${area}, ${address}`, phone, hours, services
  };
};

export const FACILITIES = [
  // Mumbai
  F('Mumbai', 'City Care Multispeciality Hospital', 'hospital', 'Bandra West', 'Mumbai 400050', '+91 22 4000 1001', '24×7 Emergency', ['Emergency', 'ICU', 'Cardiology', 'General surgery']),
  F('Mumbai', 'Lifeline Heart Institute', 'hospital', 'Worli', 'Mumbai 400018', '+91 22 4000 1002', '24×7', ['Cardiology', 'Cath lab', 'CT scan']),
  F('Mumbai', 'Sunrise Family Clinic', 'clinic', 'Andheri East', 'Mumbai 400069', '+91 22 4000 1003', 'Mon–Sat 9:00–21:00', ['General physician', 'Vaccination']),
  F('Mumbai', 'Metro Diagnostics Lab', 'lab', 'Dadar', 'Mumbai 400014', '+91 22 4000 1004', 'Mon–Sun 7:00–20:00', ['Blood tests', 'Home sample collection', 'X-ray']),
  F('Mumbai', 'Green Cross Pharmacy', 'pharmacy', 'Powai', 'Mumbai 400076', '+91 22 4000 1005', '8:00–23:00', ['Medicines', 'OTC', 'Delivery']),
  F('Mumbai', 'Apex Emergency Hospital', 'emergency', 'Sion', 'Mumbai 400022', '+91 22 4000 1006', '24×7 Trauma centre', ['Trauma', 'Ambulance', 'Stroke unit']),
  // Delhi
  F('Delhi', 'Capital Med City Hospital', 'hospital', 'Saket', 'New Delhi 110017', '+91 11 4000 2001', '24×7 Emergency', ['Emergency', 'Neurology', 'Oncology']),
  F('Delhi', 'Heartline Specialty Centre', 'hospital', 'Karol Bagh', 'New Delhi 110005', '+91 11 4000 2002', '24×7', ['Cardiology', 'Echo', 'Stress test']),
  F('Delhi', 'FamilyFirst Clinic', 'clinic', 'Dwarka', 'New Delhi 110075', '+91 11 4000 2003', 'Mon–Sat 10:00–20:00', ['GP', 'Pediatrics']),
  F('Delhi', 'PathCare Laboratories', 'lab', 'Rohini', 'New Delhi 110085', '+91 11 4000 2004', '6:30–21:00', ['CBC', 'HbA1c', 'Lipid profile', 'Home collection']),
  F('Delhi', 'MedPlus Pharmacy', 'pharmacy', 'Lajpat Nagar', 'New Delhi 110024', '+91 11 4000 2005', '8:30–23:30', ['Retail pharmacy']),
  F('Delhi', 'North Star Trauma Centre', 'emergency', 'Civil Lines', 'New Delhi 110054', '+91 11 4000 2006', '24×7', ['Trauma', 'Emergency']),
  // Bengaluru
  F('Bengaluru', 'Garden City General Hospital', 'hospital', 'Jayanagar', 'Bengaluru 560041', '+91 80 4000 3001', '24×7 Emergency', ['Emergency', 'General medicine', 'Orthopedics']),
  F('Bengaluru', 'Pulse Cardiac Care', 'hospital', 'Indiranagar', 'Bengaluru 560038', '+91 80 4000 3002', '24×7', ['Cardiology', 'Angioplasty']),
  F('Bengaluru', 'Namma Health Clinic', 'clinic', 'HSR Layout', 'Bengaluru 560102', '+91 80 4000 3003', 'Mon–Sat 9:00–20:30', ['GP', 'Diabetes review']),
  F('Bengaluru', 'Accura Labs', 'lab', 'Koramangala', 'Bengaluru 560034', '+91 80 4000 3004', '7:00–21:00', ['Full-body packages', 'Thyroid', 'HbA1c']),
  F('Bengaluru', 'Wellness Chemists', 'pharmacy', 'Whitefield', 'Bengaluru 560066', '+91 80 4000 3005', '8:00–22:30', ['Pharmacy', 'Insurance billing']),
  F('Bengaluru', 'East Point Emergency Hospital', 'emergency', 'Marathahalli', 'Bengaluru 560037', '+91 80 4000 3006', '24×7', ['Emergency', 'Ambulance']),
  // Hyderabad
  F('Hyderabad', 'Deccan Multispeciality Hospital', 'hospital', 'Banjara Hills', 'Hyderabad 500034', '+91 40 4000 4001', '24×7', ['Emergency', 'Cardiology', 'Nephrology']),
  F('Hyderabad', 'Charminar Family Clinic', 'clinic', 'Madhapur', 'Hyderabad 500081', '+91 40 4000 4002', 'Mon–Sat 9:30–20:00', ['GP', 'Physiotherapy']),
  F('Hyderabad', 'Genome Diagnostics', 'lab', 'Gachibowli', 'Hyderabad 500032', '+91 40 4000 4003', '6:30–21:30', ['Genetic tests', 'Routine labs']),
  F('Hyderabad', 'CityMed Pharmacy', 'pharmacy', 'Kukatpally', 'Hyderabad 500072', '+91 40 4000 4004', '8:00–23:00', ['Pharmacy']),
  F('Hyderabad', 'Pearl Emergency Care', 'emergency', 'Secunderabad', 'Hyderabad 500003', '+91 40 4000 4005', '24×7 trauma', ['Trauma', 'ER']),
  // Chennai
  F('Chennai', 'Marina General Hospital', 'hospital', 'Adyar', 'Chennai 600020', '+91 44 4000 5001', '24×7', ['Emergency', 'Endocrinology']),
  F('Chennai', 'Dr. Radha Clinic', 'clinic', 'T. Nagar', 'Chennai 600017', '+91 44 4000 5002', 'Mon–Sat 9:00–13:00, 17:00–21:00', ['GP', 'BP & sugar checks']),
  F('Chennai', 'Temple City Labs', 'lab', 'Mylapore', 'Chennai 600004', '+91 44 4000 5003', '7:00–20:00', ['CBC', 'Liver panel', 'Vitamin D']),
  F('Chennai', 'Anna Pharmacy 24h', 'pharmacy', 'Anna Nagar', 'Chennai 600040', '+91 44 4000 5004', '24×7', ['Pharmacy']),
  F('Chennai', 'Bay of Bengal ER', 'emergency', 'Besant Nagar', 'Chennai 600090', '+91 44 4000 5005', '24×7', ['Emergency', 'Ambulance']),
  // Pune
  F('Pune', 'Deccan Gymkhana Hospital', 'hospital', 'Deccan', 'Pune 411004', '+91 20 4000 6001', '24×7', ['Emergency', 'Cardiology']),
  F('Pune', 'Kothrud Family Practice', 'clinic', 'Kothrud', 'Pune 411038', '+91 20 4000 6002', 'Mon–Sat 9:00–20:00', ['GP']),
  F('Pune', 'Sahyadri Pathology', 'lab', 'Viman Nagar', 'Pune 411014', '+91 20 4000 6003', '7:00–21:00', ['Lipid profile', 'HbA1c']),
  F('Pune', 'Express Chemist', 'pharmacy', 'Baner', 'Pune 411045', '+91 20 4000 6004', '8:30–22:30', ['Pharmacy']),
  F('Pune', 'Sinhagad Emergency Hospital', 'emergency', 'Kondhwa', 'Pune 411048', '+91 20 4000 6005', '24×7', ['Trauma']),
  // Ahmedabad
  F('Ahmedabad', 'Sabarmati Multispeciality', 'hospital', 'Navrangpura', 'Ahmedabad 380009', '+91 79 4000 7001', '24×7', ['Emergency', 'General surgery']),
  F('Ahmedabad', 'Satellite Clinic', 'clinic', 'Satellite', 'Ahmedabad 380015', '+91 79 4000 7002', 'Mon–Sat 9:00–19:30', ['GP', 'ECG']),
  F('Ahmedabad', 'Shreeji Diagnostics', 'lab', 'Maninagar', 'Ahmedabad 380008', '+91 79 4000 7003', '7:00–20:30', ['Thyroid panel']),
  F('Ahmedabad', 'Law Garden Pharmacy', 'pharmacy', 'Ellisbridge', 'Ahmedabad 380006', '+91 79 4000 7004', '8:00–23:00', ['Pharmacy']),
  // Kolkata
  F('Kolkata', 'Howrah Bridge General Hospital', 'hospital', 'Salt Lake', 'Kolkata 700091', '+91 33 4000 8001', '24×7', ['Emergency', 'Cardiology', 'Neurology']),
  F('Kolkata', 'Park Street Polyclinic', 'clinic', 'Park Street', 'Kolkata 700016', '+91 33 4000 8002', 'Mon–Sat 10:00–20:00', ['GP', 'Diabetes clinic']),
  F('Kolkata', 'Bengal Path Labs', 'lab', 'Behala', 'Kolkata 700034', '+91 33 4000 8003', '6:30–21:00', ['Home collection']),
  F('Kolkata', 'Gariahat Chemists', 'pharmacy', 'Gariahat', 'Kolkata 700019', '+91 33 4000 8004', '8:00–22:00', ['Pharmacy']),
  // Jaipur
  F('Jaipur', 'Pink City Hospital', 'hospital', 'Malviya Nagar', 'Jaipur 302017', '+91 141 400 9001', '24×7', ['Emergency', 'Orthopedics']),
  F('Jaipur', 'Vaishali Clinic', 'clinic', 'Vaishali Nagar', 'Jaipur 302021', '+91 141 400 9002', 'Mon–Sat 9:00–20:00', ['GP']),
  F('Jaipur', 'Aravalli Diagnostics', 'lab', 'C-Scheme', 'Jaipur 302001', '+91 141 400 9003', '7:00–20:00', ['CBC', 'HbA1c']),
  F('Jaipur', 'MI Road Pharmacy', 'pharmacy', 'MI Road', 'Jaipur 302001', '+91 141 400 9004', '8:30–22:00', ['Pharmacy']),
  // Kochi
  F('Kochi', 'Backwater Medical College Hospital', 'hospital', 'Kalamassery', 'Kochi 683104', '+91 484 400 0001', '24×7', ['Emergency', 'Cardiology']),
  F('Kochi', 'Fort Kochi Family Clinic', 'clinic', 'Fort Kochi', 'Kochi 682001', '+91 484 400 0002', 'Mon–Sat 9:00–19:00', ['GP']),
  F('Kochi', 'Marine Drive Labs', 'lab', 'Ernakulam', 'Kochi 682031', '+91 484 400 0003', '7:00–20:30', ['Lipid profile']),
  F('Kochi', 'Lulu Pharmacy', 'pharmacy', 'Edappally', 'Kochi 682024', '+91 484 400 0004', '9:00–22:00', ['Pharmacy'])
];

/* Offline results are only meaningful within this range of the origin.
   Beyond it we switch to the nearest city's dataset instead of showing
   hospitals hundreds of kilometres away as "closest". */
const SAMPLE_RADIUS_KM = 80;

export function searchFacilities({ lat, lng, city, type = '', q = '', maxResults = 12 }) {
  let list = FACILITIES.slice();
  if (type && type !== 'all') list = list.filter(f => f.type === type);
  if (q) list = list.filter(f => (f.name + f.city + f.services.join(' ') + f.address).toLowerCase().includes(q.toLowerCase()));
  if (lat != null && lng != null) {
    for (const f of list) f.distanceKm = Math.round(haversine(lat, lng, f.lat, f.lng) * 10) / 10;
    const near = list.filter(f => f.distanceKm <= SAMPLE_RADIUS_KM);
    if (near.length) {
      near.sort((a, b) => a.distanceKm - b.distanceKm);
      return near.slice(0, maxResults);
    }
    // Nothing within range — surface the nearest city's facilities instead.
    const nearestCity = CITIES.slice()
      .sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng))[0];
    return list.filter(f => f.city === nearestCity.name)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, maxResults);
  }
  if (city) list = list.filter(f => f.city === city);
  return list.slice(0, maxResults);
}

/* ---------------- Live discovery via OpenStreetMap ----------------
   Overpass API (no key required). Falls back to bundled sample data
   whenever the network is unavailable or slow. Results are cached
   in-memory for 10 minutes per rounded coordinate + type. */

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
];

const LIVE_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'HealthSphereAI/1.0 (family health platform; contact: demo@healthsphere.ai)',
  'Accept': 'application/json'
};

const TYPE_FILTER = {
  all: ['["amenity"~"^(hospital|clinic|pharmacy|doctors)$"]', '["healthcare"="laboratory"]'],
  hospital: ['["amenity"="hospital"]'],
  clinic: ['["amenity"~"^(clinic|doctors|dentist)$"]'],
  lab: ['["healthcare"="laboratory"]', '["amenity"="clinic"]["healthcare"~"laborator|patholog|diagnost", i]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  emergency: ['["amenity"="hospital"]["emergency"="yes"]', '["healthcare"="hospital"]']
};

function classify(tags = {}) {
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.healthcare === 'laboratory' || /lab|patholog|diagnost/i.test(tags.healthcare || '')) return 'lab';
  if (tags.amenity === 'hospital') return tags.emergency === 'yes' ? 'emergency' : 'hospital';
  if (['clinic', 'doctors', 'dentist'].includes(tags.amenity)) return tags.emergency === 'yes' ? 'emergency' : 'clinic';
  return 'clinic';
}

const cache = new Map(); // key -> { ts, results }
const CACHE_TTL = 10 * 60 * 1000;
let preferredMirror = 0;
let chain = Promise.resolve();
let cooldownUntil = 0;

function serialized(fn) {
  const p = chain.then(fn);
  chain = p.then(() => {}, () => {});
  return p;
}

function orderedMirrors() {
  return [...OVERPASS_URLS.slice(preferredMirror), ...OVERPASS_URLS.slice(0, preferredMirror)];
}

/* Overpass can legitimately take 10–20s for an around() query; aborting at
   10s killed every attempt and silently degraded to the sample dataset. */
async function overpassQuery(query, timeoutMs = 25000) {
  for (const base of orderedMirrors()) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const idx = OVERPASS_URLS.indexOf(base);
    try {
      const r = await fetch(base, { method: 'POST', headers: LIVE_HEADERS, body: 'data=' + encodeURIComponent(query), signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      preferredMirror = idx >= 0 ? idx : preferredMirror;
      return await r.json();
    } catch {
      clearTimeout(t);
    }
  }
  throw new Error('overpass_unavailable');
}

let liveSeq = 0;
export async function fetchNearbyLive({ lat, lng, type = 'all', q = '', radiusM = 6000, maxResults = 24 }) {
  const coordKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  let base = cache.get(coordKey);
  if (!(base && Date.now() - base.ts < CACHE_TTL)) {
    if (Date.now() < cooldownUntil) throw new Error('overpass_cooldown');

    // One broad query per location — all type/name filtering happens in memory
    // afterwards so filter changes never hit the network again.
    const bboxParts = TYPE_FILTER.all.map(f =>
      `node(around:${radiusM},${lat},${lng})${f};way(around:${radiusM},${lat},${lng})${f};`
    ).join('');
    const query = `[out:json][timeout:25];(${bboxParts});out center tags 160;`;

    let data;
    try {
      data = await serialized(() => overpassQuery(query));
      cooldownUntil = 0;
    } catch (e) {
      cooldownUntil = Date.now() + 45 * 1000;
      throw e;
    }

    let fullList = (data.elements || []).map(el => {
      const c = el.type === 'node' ? el : (el.center || {});
      const plat = c.lat ?? el.lat, plng = c.lon ?? el.lng ?? el.lon;
      const t = el.tags || {};
      const addr = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:neighbourhood'], t['addr:city'], t['addr:postcode']]
        .filter(Boolean).join(' ');
      return {
        id: `live_${++liveSeq}`,
        name: t.name || t.brand || t.operator || 'Unnamed facility',
        type: classify(t),
        lat: plat, lng: plng,
        address: addr || 'Address not listed',
        phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
        hours: t.opening_hours || 'Hours not listed',
        services: [t.specialty, t['healthcare:speciality']].filter(Boolean).join(', ').split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 5),
        osm: `https://www.openstreetmap.org/${el.type}/${el.id}`
      };
    }).filter(f => f.lat != null && f.lng != null && f.name !== 'Unnamed facility');

    for (const f of fullList) f.distanceKm = +(haversine(lat, lng, f.lat, f.lng)).toFixed(1);
    const seen = [];
    fullList = fullList.filter(f => !seen.some(s => s.name === f.name && Math.abs(s.distanceKm - f.distanceKm) < 0.05) && seen.push(f));
    fullList.sort((a, b) => a.distanceKm - b.distanceKm);

    base = { ts: Date.now(), results: fullList };
    cache.set(coordKey, base);
  }

  let results = base.results.slice();
  if (type && type !== 'all') results = results.filter(f => f.type === type);
  if (q) results = results.filter(f => (f.name + ' ' + f.address).toLowerCase().includes(q.toLowerCase()));
  return results.slice(0, maxResults);
}

export async function geocodePlace(placeQ) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(placeQ);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'HealthSphereAI/1.0 (demo)', 'Accept-Language': 'en' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('geocode_failed');
    const arr = await r.json();
    if (!arr.length) throw new Error('Place not found');
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), label: arr[0].display_name.split(',').slice(0, 2).join(',') };
  } catch (e) {
    clearTimeout(t);
    const local = CITIES.find(c => c.name.toLowerCase() === placeQ.trim().toLowerCase());
    if (local) return { lat: local.lat, lng: local.lng, label: local.name };
    throw e;
  }
}
