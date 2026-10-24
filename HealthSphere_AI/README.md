# HealthSphere AI - README

## Project Overview
HealthSphere AI is a zero-dependency, rule-based preventive-care management platform that analyzes your health records, family history, and reports to generate personalized insights and risk signals. All processing occurs on-device; nothing leaves your server.

**Core Features:**
- Family health history tree with maternal/paternal grandparents
- Lab report upload & automatic value extraction (PDF + in-browser OCR for images)
- Risk signals & preventive-care guidance
- Lifestyle tracking & reminders
- Family history patterns & genetic risk patterns

## Quick Start (Run the Project)

### Prerequisites
- Node.js >= version 18
- Git (optional, for cloning)
- A modern browser (Chrome/Firefox/Edge)

### Installation
```bash
# 1. Clone or navigate to the project
cd D:\Github\HealthSphere\HealthSphere_AI

# 2. Install backend dependencies
npm install

# 3. Start the server
#    This will also open your browser to http://localhost:3000
npm start
#    Or manually: node server.js --open

# 4. The server logs will show:
#    - HealthSphere AI - Family Health Intelligence
#    - Server: http://localhost:3000
#    - Demo: demo@healthsphere.ai / demo1234
```

### Accessing the App
- Open your browser to `http://localhost:3000`
- The first time you use the app, you'll need to register (see "User Manual" below)
- Already have an account? Use the credentials created during registration

### Development Mode
```bash
# Run tests
npm test

# Watch mode (auto-reload on file changes)
npm run dev
```

## Login & Authentication

### Authentication Flow
HealthSphere uses **cookie-based authentication** — no explicit login page is required after registration.

1. **Register** — Visit `/family` (or `/reports`) and click "Register / Log in"
2. **Complete the registration form** — fill name, sex, birth date, etc.
3. **You are now logged in** — a session cookie (`hs_token`) is set automatically
4. **To log in again** (e.g., after clearing cookies):
   - Use the login form with your email and password
   - Or re-register

### API Auth Endpoints (for developers)
- `POST /api/auth/register` — register a new user
- `POST /api/auth/login` — login with email/password
- `POST /api/auth/logout` — clear the session cookie
- All other API calls require the `hs_token` cookie (sent automatically via `credentials: 'same-origin'`)

### Forgot Password / Password Reset
- Use the `changePassword` API if you know your current password
- Account deletion via the settings flow

## Demo Accounts & Credentials

These accounts are created automatically on first server start (seeding is idempotent — restarting never duplicates them). All credentials are for local demos only; change them before any production use.

### Patient & Admin

| Role | Email | Password |
| --- | --- | --- |
| Patient (demo data) | `demo@healthsphere.ai` | `demo1234` |
| Admin | `admin123@healthsphere.ai` | `Admin@1234` |

### Doctors — log in at `#/doctor/login`

| Doctor ID | Name | Specialization | License / Registration | Email | Password |
| --- | --- | --- | --- | --- | --- |
| `docacc_seed_kavita` | Dr. Kavita Rao | General Physician | `MH-MC-2011-45231` | `doctor1@healthsphere.ai` | `Doctor@1234` |
| `docacc_seed_sameer` | Dr. Sameer Menon | Cardiologist | `MH-MC-2008-33120` | `doctor2@healthsphere.ai` | `Doctor@1234` |
| `docacc_seed_ananya` | Dr. Ananya Iyer | Endocrinologist | `KA-MC-2013-56784` | `doctor3@healthsphere.ai` | `Doctor@1234` |

All three are `verified`. Dr. Kavita Rao and Dr. Sameer Menon start `online` (visible for consultation); Dr. Ananya Iyer starts `offline`.

### Medical Stores — log in at `#/store-owner/login`

| Store ID | Owner ID | Store | Owner | License | Email | Password |
| --- | --- | --- | --- | --- | --- | --- |
| `store_seed_sunrise` | `storeown_seed_sunrise` | Sunrise Pharmacy (Mumbai) | Ravi Sharma | `MH-PH-2024-001` | `pharmacy1@healthsphere.ai` | `Pharmacy@1234` |
| `store_seed_medplus` | `storeown_seed_medplus` | MedPlus Chemist (Bengaluru) | Priya Nair | `KA-PH-2023-442` | `pharmacy2@healthsphere.ai` | `Pharmacy@1234` |
| `store_seed_wellcare` | `storeown_seed_wellcare` | WellCare Medical Store (New Delhi) | Amit Verma | `DL-PH-2022-778` | `pharmacy3@healthsphere.ai` | `Pharmacy@1234` |

Each seeded store is `approved` and includes a `products` medicine list (8 items) inside its store record:

- **Sunrise Pharmacy** — Paracetamol 500mg, Metformin 500mg, Amlodipine 5mg, Cetirizine 10mg, Vitamin D3 60K IU, Omeprazole 20mg, Digital Thermometer, Surgical Mask (50 pack)
- **MedPlus Chemist** — Atorvastatin 10mg, Levothyroxine 50mcg, Azithromycin 500mg, ORS Powder, Ibuprofen 400mg, Glucose Meter, BP Monitor (Automatic), Hand Sanitizer 500ml
- **WellCare Medical Store** — Insulin Glargine 100IU/ml, Aspirin 75mg, Losartan 50mg, Multivitamin Complex, First Aid Kit, Pulse Oximeter, Antiseptic Solution 100ml, N95 Mask (5 pack)

Browse the catalogue at `#/stores` or via the API: `GET /api/stores/<store-id>/products` (for example `GET /api/stores/store_seed_sunrise/products`).

## User Manual

### 1. Family Health History Tree
- **Access:** Click "Family" in the left navigation
- **Add members:** Click "+ Add relative" on any node or use the bottom form
- **Relationships:** Suggested relationships appear based on where you are in the tree
- **Edit:** Select a node → "Update record" → change name, relationship, age, conditions
- **Re-parent:** Select a node → "Edit" → use the "Linked to" selector to change its ancestor
- **Delete:** Select a node → "Remove" — children are re-anchored to the deleted person's own parent

### 2. Upload & Understand Reports
- **Supported files:** PDF (with text layer), TXT, JPG, PNG (max 15 MB)
- **How to upload:**
  - Drag & drop or click "Upload report"
  - The pipeline runs: File validation → OCR/parsing → Safety check → Medical entity extraction → Value normalization → Structured data
- **Image OCR (new!):** For JPG/PNG images, the browser runs real OCR (tesseract.js) and sends the text to the server. Recognized text appears in the report modal — you can review and re-extract.
- **If OCR fails:** Use "Paste report text" to manually enter values
- **Review extracted values:** After processing, see a table of recognized analytes with flags (high/low/normal) and reference ranges

### 3. Insights & Risk Signals
- **Access:** Click "Insights" in the left navigation
- **What you'll see:**
  - Risk signals with severity badges
  - Contributing factors for each signal
  - Specialty suggestions for discussion
  - Preventive screening checklist
  - Specialist recommendations

### 4. Lifestyle & Reminders
- **Lifestyle Hub:** Track exercise, sleep, hydration, weight
- **Reminders:** Auto-generated from abnormal results and follow-ups; add your own
- **Goals:** Hydration target based on weight, weekly insights from logs

### 5. Family History
- **Add relatives:** Parents, grandparents, siblings — conditions and relations propagate through the tree
- **View patterns:** Across relatives — which conditions appear most often
- **Impact:** Family patterns feed your personalized risk signals

### 6. Profile & Settings
- **My Profile:** Edit DOB, sex, blood group, height, weight, allergies, conditions
- **Export/Download:** Full JSON export of all records
- **Privacy/Delete:** Delete account, consent toggles (contacts import, location sharing, report sharing)

## Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                       │
│  ┌─────────────────┐  ┌────────────────────────────────────┐ │
│  │  Vanilla JS UI  │  │  API Calls (same-origin, cookie) │ │
│  └─────────────────┘  └────────────────────────────────────┘ │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SPA (Single Page Application) — modular JS modules         │ │
│  │  - views-family.js   (family tree + layout engine)         │ │
│  │  - views-health.js   (report upload + OCR pipeline)        │ │
│  │  - views-reports.js  (report modal + OCR re-extract)       │ │
│  │  - ui.js             (toast, modal, helper functions)      │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  FRONTEND ASSETS (served by Node)                          │ │
│  │  - index.html      (v31 cache-busting)                     │ │
│  │  - styles.css       (balanced braces, fg-* classes)        │ │
│  │  - component JS     (lazy-loaded tesseract.js for OCR)     │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  BACKEND (Node.js + Express‑like router)                   │ │
│  │  - api.js           (all REST routes + auth + extraction)  │ │
│  │  - extraction.js    (document intelligence, zero deps)     │ │
│  │  - auth.js          (cookie‑based session, logout)         │ │
│  │  - db.js            (PostgreSQL via pg pool)               │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  DATABASE (PostgreSQL)                                       │ │
│  │  - tables: users, reports, metrics, profiles, reminders   │ │
│  │  - pg pool (connection pooling)                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ZERO‑DEPENDENCY CORE                                        │ │
│  │  - No npm packages beyond `pg` (as designed for hackathon) │ │
│  │  - Rule‑based extraction (regex + alias patterns)          │ │
│  │  - In‑browser OCR via tesseract.js CDN (only at upload)   │ │
│  │  - All logic stays on‑server; nothing streams externally │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Technical Decisions
1. **Zero‑dependency backend** — only `pg` for database; all extraction is regex‑based
2. **In‑browser OCR** — tesseract.js from CDN; no server-side image processing
3. **Cookie‑based auth** — `hs_token` HttpOnly cookie; no JWTs or localStorage
4. **Cache busting** — `window.APP_VERSION` + `?v=` query on all assets; bump on every frontend change
5. **Archival‑safe report storage** — stored files survive database migrations; `ocrText` capped at 30KB
6. **Re‑extraction flow** — for old reports without OCR text, use the "Read image again (OCR)" button to re‑process the stored file

### File Structure (simplified)
```
D:\Github\HealthSphere\HealthSphere_AI\
├─ backend/
│  ├─ lib/
│  │  ├─ api.js          (all routes + extraction handling)
│  │  ├─ extraction.js   (document intelligence, OCR support)
│  │  ├─ auth.js         (login/logout/password)
│  │  ├─ terms.js        (TERMS_VERSION '1.0')
│  │  └─ terms-text.js   (19‑clause T&C)
│  ├─ routes/            (optional: route files if split)
│  ├─ server.js          (entry point: node server.js --open)
│  └─ server.log / server.err (runtime output)
├─ frontend/
│  ├─ js/
│  │  ├─ views-family.js   (tree layout, generation, labels)
│  │  ├─ views-health.js   (report upload, OCR pipeline, modals)
│  │  ├─ views-reports.js  (report modal + re-extract)
│  │  ├─ ui.js           (toast, modal, helpers)
│  │  └─ api.js           (fetch wrapper + auth)
│  ├─ css/
│  │  └─ styles.css       (fg-* classes, balanced braces)
│  └─ index.html         (v31 cache‑busting, all assets)
└─ README.md             (this file)
```

## Development Notes

### Adding New Features
- **New lab analyte:** Add to `TEST_LIBRARY` in `extraction.js` + aliases
- **New report type:** Extend `extractEntities` regex + add unit/flag logic
- **New tree layout:** Modify `renderGraph()` in `views-health.js` (layout functions at bottom)

### Debugging Tips
- Check `backend/server.log` for startup and extraction details
- Frontend OCR progress appears in the pipeline UI (three‑stage ticker)
- Server errors appear as toast notifications; `err` type adds red styling
- The `api()` helper auto‑aborts after 12 s; increase `timeout` option if needed

### Common Pitfalls
- **Server not restarted after code changes** — always restart `node server.js` (or `npm start`) to pick up new `extraction.js`/`api.js`
- **OCR engine not loaded** — first image upload downloads ~2 MB from CDN; subsequent uploads use cache
- **Duplicate servers** — if `npm start` is run while another instance is running, ports conflict (3000/3001). Kill existing `node` processes before starting anew.
- **CSS brace imbalance** — the linter caught 839/839 originally; any new `}`/`{` must balance

## Need Help?
- Check the `backend/server.log` for extraction details
- Re‑run `npm test` to verify the extraction pipeline
- Open the WhatsApp report and click **"Read image again (OCR)"** to re‑process old uploads
- For auth issues: clear cookies for `localhost` and re‑register

---
*HealthSphere AI — Family Health Intelligence, Privacy‑First, Zero‑Dependency.*