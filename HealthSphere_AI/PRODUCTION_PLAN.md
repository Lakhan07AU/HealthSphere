# HealthSphere AI — Production Readiness Plan (4-5 Days)

## 🎯 Goal
Deploy a secure, observable, scalable version to real users with:
- Relational Postgres (not JSON blob)
- Password reset + email notifications
- MFA (TOTP)
- Observability (logs, metrics, alerts)
- Hardened security (HSTS, CSRF, rate limits)
- Family sharing (invite links)
- CI/CD pipeline

---

## 📅 Day-by-Day Execution Plan

### DAY 1 — Infrastructure & Database Migration (6-8 hrs)
**Morning (3-4 hrs)**
- [ ] Provision Supabase project (Postgres + Storage)
- [ ] Create Cloudinary account (signed uploads)
- [ ] Design Postgres schema (see `SCHEMA.sql` below)
- [ ] Write migration script: JSON → relational tables
- [ ] Test migration locally with seed data

**Afternoon (3-4 hrs)**
- [ ] Deploy to Railway/Render (persistent VM) or Vercel + Supabase
- [ ] Configure custom domain + TLS (Caddy or Vercel)
- [ ] Set all production env vars
- [ ] Enable Supabase PITR + daily backups
- [ ] Verify `/api/health` works end-to-end

**Deliverable**: Staging URL with migrated data, cloud file storage working

---

### DAY 2 — Auth Hardening & Email (6-8 hrs)
**Morning (3-4 hrs)**
- [ ] Add `Secure` cookie flag (auto on HTTPS)
- [ ] Add HSTS header: `max-age=31536000; includeSubDomains; preload`
- [ ] Implement CSRF tokens for all mutating endpoints
- [ ] Add rate limiting on `/api/auth/*`, `/api/reports`, `/api/feedback`
- [ ] Run `npm audit` + fix vulnerabilities

**Afternoon (3-4 hrs)**
- [ ] Create Resend account (3k emails/mo free)
- [ ] Implement `/api/auth/forgot-password` → sends signed JWT token (15 min expiry)
- [ ] Implement `/api/auth/reset-password` → validates token, updates hash
- [ ] Add email templates (reset, welcome, consult notify, reminder digest)
- [ ] Add email notification for SOS alerts (to primary contact)
- [ ] Test full reset flow + email delivery

**Deliverable**: Password reset working, emails sending, security headers verified

---

### DAY 3 — MFA + Family Sharing + Observability (6-8 hrs)
**Morning (3-4 hrs)**
- [ ] Add TOTP MFA (use `otplib`):
  - `POST /api/auth/mfa/enable` → returns QR code + backup codes
  - `POST /api/auth/mfa/verify` → enables MFA on account
  - `POST /api/auth/mfa/disable` → requires current TOTP
  - Modify `loginUser` to require TOTP if enabled
- [ ] Add MFA settings UI in `views-settings.js`

**Afternoon (3-4 hrs)**
- [ ] Family invite system:
  - `POST /api/family/invite` → creates signed token (7 days), emails link
  - `GET /api/family/accept/:token` → links accounts, sets `familyView` consent
  - UI in `views-family.js`: "Invite family member" button
- [ ] Observability stack:
  - Add `pino` structured logging (request ID, user ID, latency)
  - Ship logs to Better Stack (free tier)
  - Add Sentry error tracking (free tier)
  - Custom metrics: active users, report uploads, consult volume
  - UptimeRobot monitor on `/api/health`

**Deliverable**: MFA working, family invites working, logs/metrics visible

---

### DAY 4 — Polish, Load Test, Legal (6-8 hrs)
**Morning (3-4 hrs)**
- [ ] Accessibility audit: run `axe-core` in CI, fix WCAG 2.1 AA issues
- [ ] Onboarding flow: welcome → profile → first report → insights
- [ ] Mobile responsiveness fixes (test iOS Safari, Android Chrome)
- [ ] Service Worker update strategy (versioned cache, skipWaiting)

**Afternoon (3-4 hrs)**
- [ ] Load test with k6 (target: 100 concurrent users, p95 < 500ms)
- [ ] Identify bottlenecks → add indexes, connection pooling (PgBouncer)
- [ ] Write Privacy Policy + Terms of Service (use termly.io or similar)
- [ ] GDPR: DPA with Supabase/Cloudinary, Data Protection Impact Assessment
- [ ] Medical disclaimer review (already in footer, verify prominence)
- [ ] Incident response runbook (1-pager)

**Deliverable**: Load test results, legal docs, accessibility score > 95

---

### DAY 5 — Buffer + Launch Prep (4-6 hrs)
**Morning (2-3 hrs)**
- [ ] CI/CD pipeline (GitHub Actions):
  - Lint → Typecheck → Test → Build → Deploy to staging
  - Manual promote to production
- [ ] Smoke test suite (Playwright): auth, upload, consult, SOS
- [ ] Rollback plan documented (Supabase PITR + Vercel instant rollback)

**Afternoon (2-3 hrs)**
- [ ] Production deploy
- [ ] Post-deploy verification checklist
- [ ] Monitor for 2 hours
- [ ] Hand-off document: runbooks, env vars, contacts, escalation

**Deliverable**: **LIVE FOR REAL USERS** 🎉

---

## 🗄️ Postgres Schema (Migration Target)

```sql
-- users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  mfa_secret TEXT,
  mfa_enabled BOOLEAN DEFAULT false,
  backup_codes TEXT[]
);

-- sessions
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'patient',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- profiles
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dob DATE,
  sex TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  blood_group TEXT,
  allergies TEXT[],
  conditions TEXT[],
  medications JSONB,
  goals TEXT[],
  food_preference TEXT,
  restrictions TEXT[],
  lifestyle JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- families
CREATE TABLE family_members (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  name TEXT,
  age_or_year TEXT,
  conditions JSONB,
  surgeries TEXT[],
  cancer_history BOOLEAN DEFAULT false,
  genetic_conditions TEXT[],
  events JSONB,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- reports
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_name TEXT,
  mime TEXT,
  size BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  status TEXT,
  pipeline JSONB,
  structured JSONB,
  summary_text TEXT,
  file_backend TEXT,
  cloud_public_id TEXT,
  file_resource_type TEXT,
  file_data TEXT
);

-- metrics
CREATE TABLE metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  date DATE NOT NULL,
  source TEXT,
  flag TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_metrics_user_key_date ON metrics(user_id, key, date);

-- logs (lifestyle)
CREATE TABLE lifestyle_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- plans
CREATE TABLE plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  activity JSONB,
  nutrition JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- doctors (care team)
CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  specialty TEXT,
  phone TEXT,
  clinic TEXT,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- contacts (emergency)
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT,
  phone TEXT NOT NULL,
  notes TEXT,
  priority INT DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- reminders
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT,
  due_date DATE,
  recurrence JSONB,
  status TEXT DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- settings
CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consents JSONB,
  notifications JSONB,
  privacy JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- sos alerts
CREATE TABLE sos_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active',
  has_location BOOLEAN,
  message TEXT,
  cancelled_at TIMESTAMPTZ
);

-- audit log
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT,
  ts TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_user_ts ON audit_logs(user_id, ts DESC);

-- doctor accounts (separate portal)
CREATE TABLE doctor_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  qualification TEXT,
  specialization TEXT,
  verification_status TEXT DEFAULT 'pending',
  availability_status TEXT DEFAULT 'offline',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- store owner accounts
CREATE TABLE store_owner_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  owner_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  store_id TEXT,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- stores
CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES store_owner_accounts(id) ON DELETE CASCADE,
  name TEXT,
  address TEXT,
  phone TEXT,
  license_number TEXT,
  inventory JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- consultations
CREATE TABLE consult_tickets (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  doctor_id TEXT REFERENCES doctor_accounts(id) ON DELETE SET NULL,
  subject TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE consult_appointments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES consult_tickets(id) ON DELETE CASCADE,
  doctor_id TEXT REFERENCES doctor_accounts(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_min INT DEFAULT 15,
  status TEXT DEFAULT 'scheduled',
  meeting_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE consult_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES consult_tickets(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- feedback
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  user_email TEXT,
  type TEXT,
  message TEXT,
  page TEXT,
  status TEXT DEFAULT 'open',
  ts TIMESTAMPTZ DEFAULT now()
);

-- family invites
CREATE TABLE family_invites (
  token TEXT PRIMARY KEY,
  inviter_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  invitee_email TEXT,
  role TEXT DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);
```

---

## 🔧 Key Code Changes Needed

### 1. `lib/db.js` — Switch to Query Builder (Kysely)
```typescript
// Replace JSON blob with typed queries
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const dialect = new PostgresDialect({
  pool: new Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 10 })
});

export const db = new Kysely<Database>({ dialect });

// Keep same API surface: coll(), objColl(), persist() → no-op (auto-commit)
```

### 2. `lib/auth.js` — Add MFA + Password Reset
```javascript
// New endpoints in api.js
route('POST', /^\/api\/auth\/forgot-password$/, ...)
route('POST', /^\/api\/auth\/reset-password$/, ...)
route('POST', /^\/api\/auth\/mfa\/enable$/, ...)
route('POST', /^\/api\/auth\/mfa\/verify$/, ...)
route('POST', /^\/api\/auth\/mfa\/disable$/, ...)
```

### 3. `lib/api.js` — Add CSRF + Rate Limiting
```javascript
import { csrfMiddleware, rateLimit } from './security.js';
// Apply to all mutating routes
```

### 4. `server.js` — Security Headers
```javascript
// Add HSTS in production
if (process.env.NODE_ENV === 'production') {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}
```

---

## 🧪 Testing Checklist (Run Each Day)

| Test | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|------|-------|-------|-------|-------|-------|
| Unit tests (`npm test`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth flow (register/login/logout) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Password reset email | | ✅ | ✅ | ✅ | ✅ |
| MFA enable/verify/disable | | | ✅ | ✅ | ✅ |
| Report upload (PDF/image/text) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Family invite accept | | | ✅ | ✅ | ✅ |
| SOS alert → email contact | | ✅ | ✅ | ✅ | ✅ |
| Consult ticket + chat | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin panel (users, audit) | ✅ | ✅ | ✅ | ✅ | ✅ |
| k6 load test | | | | ✅ | ✅ |
| Accessibility (axe) | | | | ✅ | ✅ |

---

## 🚨 Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Migration fails | Medium | High | Test on copy first; keep JSON fallback |
| Email deliverability | Low | Medium | Use Resend + verify domain; fallback to log |
| Supabase cold starts | Low | Medium | Enable connection pooler; keep-alive ping |
| MFA locks out users | Low | High | Backup codes + admin override |
| Load test fails | Medium | Medium | Scale VM; add Redis cache for hot endpoints |

---

## 📦 Day 5 Launch Checklist

- [ ] Staging → Production promote
- [ ] DNS switched to production
- [ ] TLS certificate valid (SSL Labs A+)
- [ ] All env vars set in production
- [ ] Supabase PITR enabled
- [ ] Better Stack alerts firing
- [ ] Sentry error rate < 0.1%
- [ ] UptimeRobot green
- [ ] Legal pages live (/privacy, /terms)
- [ ] Support email monitored
- [ ] Rollback tested (Vercel instant rollback + Supabase PITR)
- [ ] Team knows incident escalation

---

## 🎉 Post-Launch (Week 2+)

- [ ] User feedback collection (in-app + email)
- [ ] Performance optimization from real traffic
- [ ] Add FHIR export for clinical interoperability
- [ ] Mobile app (Capacitor wrapper)
- [ ] Doctor portal enhancements (schedule, prescriptions)
- [ ] Pharmacy integration (eRx)
- [ ] Insurance claims helper