# HealthSphere AI 🫀

**AI-Powered Family Health & Preventive Care Management Platform**
Built from the *CareGraph AI* Product Requirements Document (v1.0) — implemented as a complete, live, working MVP.

> Your family's health history is scattered across generations, hospitals and documents.
> HealthSphere AI brings it together, understands your health journey over time, analyzes
> your medical reports, identifies meaningful trends, and helps you take informed
> preventive-health actions.

---

## ▶️ Quick start

**Requirements:** Node.js ≥ 18 (built-in `fetch` used for live map data). Zero npm dependencies.

```bash
cd HealthSphere_AI
npm start          # or: node server.js
```

Open **http://localhost:3000**

| | |
|---|---|
| **Demo login** | `demo@healthsphere.ai` / `demo1234` |
| **Or** | Click "⚡ Try the live demo" on the sign-in screen |

The demo account is pre-loaded with 2 years of realistic data: family history,
37 health metrics (HbA1c 5.4 → 5.7 → 6.0 rising exactly as in the PRD scenario),
processed lab reports, lifestyle logs, care team and emergency contacts.

```bash
npm run reset      # wipe & re-seed demo data
npm test           # run extraction / trends / rules test suites
```

---

## ✨ Features

| Module | What you get |
|---|---|
| **Dashboard** | Unified health picture — signals, trends and next steps at a glance |
| **My Profile** | Personal profile, vitals and long-term health metrics (PRD 8.2) |
| **Family History** | Family health tree — 11 relationship types, conditions with diagnosis ages (PRD 8.3) |
| **Medical Reports** | Upload PDFs/photos → automated extraction pipeline → plain-language explanation (PRD 8.4–8.6) |
| **Timeline** | Filterable longitudinal health event timeline (PRD 8.8) |
| **Insights & Risks** | Explainable risk signals, screening checklist, specialist suggestions (PRD 8.9–8.11) |
| **Lifestyle Hub** | BMR/TDEE targets, activity plans, meal grids, hydration goals (PRD 8.13–8.15) |
| **Reminders** | Auto-generated + manual reminders with snooze/complete/reschedule/disable (PRD 8.12) |
| **Care Team** | Doctors and emergency contacts, consent-gated contact import (PRD 8.16–8.18) |
| **Nearby Care** | Live hospitals/clinics/labs/pharmacies via OpenStreetMap around your location or any searched place (PRD 8.19) |
| **Emergency Mode** | Full-screen red mode: 112 call button, family doctor, priority contacts, emergency card (PRD 8.20) |
| **Settings & Privacy** | Consent toggles, notification prefs, password change, JSON data export, account deletion, audit log |
| **Admin Panel** | Admin-only oversight: platform stats, all users + their complete data (view/delete), global activity feed |

### 📍 How Nearby Care works

1. On open, the browser's native geolocation prompt appears (opt-in; coordinates are
   used only to rank results and are never stored).
2. The server queries the **Overpass API** (OpenStreetMap, no key required) for real
   facilities within ~6 km, classifies them (hospital / clinic / lab / pharmacy /
   emergency), de-duplicates and sorts by distance.
3. Alternatively, search any place by name — geocoded via Nominatim.
4. Results are cached in-memory for 10 minutes per rounded coordinate; type and name
   filters are applied locally so filter changes never hit the network again.
5. If Overpass is unreachable/slow, the app gracefully falls back to a bundled sample
   dataset restricted to facilities within 60 km of the origin (or the nearest city's
   set), clearly badged "Offline sample dataset".

---

## 🧠 How it works — the Hybrid AI architecture (PRD §10)

HealthSphere deliberately does **not** rely on an LLM. Every request flows through
**Rules + ML-style analytics + explanation layer**, then a **Safety Layer**:

```
HEALTH DATA (profile · family · reports · metrics · logs)
        │
   ┌────┼─────────┐
 Rules │ Analytics│ Explainer
   └────┼─────────┘
        ▼
 RECOMMENDATION ENGINE  →  SAFETY LAYER  →  USER
```

### Model 1 — Document Intelligence (`lib/extraction.js`, `lib/pdftext.js`)
Upload → file validation → text extraction → entity extraction → value normalization →
reference-range evaluation → structured data → plain-language explanation.
- Digital PDFs are parsed with a dependency-free PDF text miner (built on Node's `zlib`).
- ~25 analytes recognized (HbA1c, lipids, CBC, thyroid, kidney, liver, electrolytes…)
  with sex-specific reference bands where applicable.
- Handles `120/80` blood-pressure pairs, unit harmonization (`10^3/µL`, lakhs), multiple
  date formats, lab-name detection.
- **Prompt-injection guard**: instruction-like lines embedded in documents are detected
  and ignored (PRD §15 requirement).
- Photos/scans go through a human-in-the-loop review flow that feeds the same pipeline.

### Model 2 — Health Trend Engine (`lib/trends.js`)
Least-squares slopes per metric, trend classification (increasing/decreasing/stable),
sudden-change detection (≥15% jump between last two readings), z-score anomaly
detection, repeated-abnormal detection and missing-data staleness flags.

### Model 3 — Risk & Recommendation Engine (`lib/rules.js`, `lib/recommend.js`)
Evidence-informed clinical rules combine **family history + age + personal health +
report values + trends + lifestyle** into risk *signals* (never diagnoses), each with a
"Why am I seeing this?" factor list. Maps signals to specialties worth *discussing*
(Endocrinology, Cardiology…) plus an age/sex/family-aware screening checklist.

### Model 4 — Lifestyle AI (`lib/lifestyle.js`)
Mifflin-St Jeor BMR/TDEE estimates, goal-adjusted calorie targets, 4-week progressive
activity plans, 7-day vegetarian/non-veg/vegan meal grids filtered by recorded allergies,
hydration targets derived from body weight, and week-over-week lifestyle insights.

### Safety Layer
Strips diagnostic/prescription language from all AI output, enforces explainability
(no factors → no signal), attaches disclaimers, and frames every action as
*"discuss with a qualified healthcare professional."*

---

## 🏗 System architecture

```
Browser SPA (vanilla JS, hash router, hand-rolled SVG charts — no CDNs)
   │ REST + cookie sessions
Node HTTP server (server.js)  ── lib/api.js route table (~40 endpoints)
   │
lib/* services: auth · extraction · trends · rules · recommend ·
                lifestyle · reminders · timeline · hospitals · seed
   │                                    │
   │                                    └── OpenStreetMap (Overpass + Nominatim, optional, keyless)
   │
JSON persistence (data/db.json, atomic writes) + uploads/ storage
```

## 📁 Project structure

```
HealthSphere_AI/
├── server.js              # HTTP server, static files, SPA fallback (Vercel-compatible)
├── lib/
│   ├── api.js             # Route table (~40 REST endpoints), auth middleware
│   ├── auth.js            # scrypt password hashing, session cookies
│   ├── extraction.js      # Report parsing: analytes, ranges, units, dates
│   ├── pdftext.js         # Dependency-free PDF text miner (zlib-based)
│   ├── trends.js          # Slopes, sudden change, anomalies, staleness
│   ├── rules.js           # Clinical rule engine → risk signals
│   ├── recommend.js       # Specialty + screening recommendations
│   ├── lifestyle.js       # Diet/activity/hydration engines
│   ├── reminders.js       # Auto + manual reminder generation
│   ├── timeline.js        # Unified event timeline
│   ├── hospitals.js       # Nearby care: OSM live discovery + sample fallback
│   └── seed.js            # Realistic 2-year demo dataset
├── public/
│   ├── index.html         # Single-page app shell
│   ├── css/               # Design system + emergency mode styles
│   └── js/                # Hash router, API client, view modules
├── scripts/reset.mjs      # Demo data reset
├── tests/                 # Extraction / trends / rules suites (plain Node asserts)
└── data/db.json           # JSON persistence (auto-created)
```

## 🔌 API overview (selected)

| Method + path | Purpose |
|---|---|
| `POST /api/auth/register` · `/login` · `/logout` | Account lifecycle |
| `GET/PUT /api/profile` | Personal profile |
| `GET/POST/DELETE /api/family` | Family health tree |
| `POST /api/reports/upload` → `GET /api/reports/:id` | Upload → pipeline status → explained report |
| `GET /api/trends/:key` | Longitudinal analysis for a metric |
| `GET /api/timeline` | Unified filtered timeline |
| `GET /api/insights` | Risk signals + factors + screening checklist |
| `GET/PUT /api/lifestyle/*` | Plans, meals, logs, insights |
| `GET/POST/PATCH/DELETE /api/reminders` | Reminder CRUD + actions |
| `GET/POST/DELETE /api/doctors` · `/api/contacts` | Care team & emergency contacts |
| `POST /api/contacts/import` | Consent-gated device-contact import |
| `GET /api/hospitals?lat=&lng=` · `?place=` | Nearby care (live OSM, offline fallback) |
| `GET /api/emergency` | Emergency card payload |
| `GET /api/admin/overview` · `/users` · `/users/:id` · `DELETE /users/:id` · `/audit` | Admin panel (role-gated) |
| `PUT /api/settings` · `GET /api/export` · `DELETE /api/account` · `GET /api/audit` | Privacy & data rights |

---

## 🔒 Security & privacy (PRD §14)

- scrypt-hashed passwords, httpOnly session cookies, same-origin credentials
- Location is opt-in, used transiently for ranking only, never persisted
- Explicit consent toggles (contacts import, location, report sharing, family view) with audit trail
- One-click full data export (JSON) and immediate irreversible account deletion
- Every sensitive access (emergency card, exports, consent changes) is audited

### Admin access

The **Admin Panel** (`#/admin`) is visible only to admins — every `/api/admin/*` route
is re-checked server-side. Admins are set via the `ADMIN_EMAILS` env var
(comma-separated); when unset it defaults to `dipinroka24@gmail.com` and the demo
account. Change it before any real deployment.

## ☁️ Deploy (Vercel)

`vercel.json` is included; the server detects `process.env.VERCEL` and exports a
serverless handler instead of listening. No environment variables or API keys needed.

### Optional: persistent cloud database (Supabase)

By default data lives in `data/db.json` (and in ephemeral `/tmp` on Vercel — demo data
re-seeds per cold start). To persist for real across restarts/deploys:

1. Create a free project at [supabase.com](https://supabase.com) (Postgres, 500 MB free).
2. Copy **Settings → Database → Connection string** (Session pooler URI) and insert your password.
3. Set it as an environment variable — no code changes needed, `lib/db.js` auto-detects it:

   ```powershell
   # local
   $env:SUPABASE_DB_URL = "postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
   npm start
   ```

   On Vercel: Project → Settings → Environment Variables → `SUPABASE_DB_URL` → Redeploy.

The entire state is stored as one JSONB row (`app_state`) created automatically on first
boot; if the connection fails at startup the app falls back to the local file store.

### Persistent report files (Supabase Storage, free tier)

Report PDFs/photos upload to local `uploads/` by default — which Vercel wipes on
every redeploy. The same free Supabase project can host them (`lib/storage.js`
auto-detects it, zero new dependencies):

1. In your Supabase project: **Storage → New bucket** named `reports`, kept
   **private** (the server reads with the service key; files are still served
   only to their signed-in owner via `/api/reports/:id/file`).
2. Copy **Settings → API**: the **Project URL** and the **service_role** key
   (never the anon key — uploads bypass RLS server-side).
3. Set environment variables (locally or Vercel → Settings → Environment Variables):

   ```powershell
   # local
   $env:SUPABASE_URL = "https://xyzcompany.supabase.co"
   $env:SUPABASE_SERVICE_KEY = "eyJhbGciOi...service-role-key"
   npm start
   ```

   Optional: `SUPABASE_STORAGE_BUCKET` if you named the bucket differently.
4. Verify: Admin Panel → system info shows `fileStorage: "supabase"`.
   Upload a report — downloads keep working after redeploys.

Without these vars the app behaves exactly as before (local disk). Files uploaded
before Supabase was configured are still readable locally via automatic fallback.

### Optional: product insight add-ons (all with free tiers)

- **Instant record search** — built in, no keys needed. `GET /api/search?q=`
  federates reports, family, reminders, metrics, and care team; the ⌘K palette
  shows grouped results with icons. (A hosted alternative from the
  free-for-dev list is Algolia's Build plan — 10K searches/mo — if you outgrow
  local search; the palette's result renderer is already adapter-shaped.)
- **In-app feedback** — built in, no keys needed. The floating Feedback button
  posts to `/api/feedback`; admins triage in Admin → Feedback tab.
  (Hosted alternative: FabForm/Formcarry free tiers.)
- **Session replay (Microsoft Clarity — free, unlimited)** — paste your project
  ID into `window.CLARITY_ID` in `public/index.html`. Empty = fully disabled,
  no requests leave the browser. For a health app, also turn on **"Mask all
  content"** in your Clarity project settings so record text is never recorded.

## ⚠️ Medical disclaimer

HealthSphere AI organizes and explains health information. It does not diagnose
diseases, prescribe medication, or replace healthcare professionals. Every insight is
informational and encourages professional evaluation.

## 📄 License

MIT
