# HealthSphere AI — Production Readiness Presentation
**Format**: Marp-compatible Markdown → Export to PPTX/PDF
**Command**: `npx @marp-team/marp-cli@latest PRODUCTION_PPT.md --output production.pptx --theme-set ./marp-theme.css`

---

<!--
paginate: true
header: HealthSphere AI — Production Readiness
footer: Confidential — Internal Use Only
theme: custom
-->

---

# HealthSphere AI
## Production Readiness Plan — 4-5 Days

**Current State**: Feature-complete MVP, JSON-file/Supabase-jsonb persistence, zero-dep Node backend, vanilla JS frontend
**Target**: Production-hardened, scalable, compliant, observable, real-user ready

---

# Agenda

1. **Architecture Overview** — What we have today
2. **Critical Gaps** — Security, Scale, Compliance, Features
3. **4-5 Day Execution Plan** — Day-by-day breakdown
4. **Database Migration** — JSON → Relational Postgres
5. **Security Hardening** — Auth, Headers, Rate Limits, MFA
6. **Observability Stack** — Logs, Metrics, Alerts, Tracing
7. **Launch Checklist** — Go/No-Go criteria
8. **Post-Launch Roadmap** — Week 2+

---

# 1. Architecture Overview

## Current Stack

| Layer | Technology | Status |
|-------|------------|--------|
| **Backend** | Node.js 18+ (ESM), zero framework | ✅ Complete |
| **API** | Custom router, REST + hash-based SPA | ✅ Complete |
| **Database** | JSON file (`data/db.json`) OR Supabase `jsonb` | ⚠️ MVP only |
| **File Storage** | 4-tier: Supabase/Cloudinary/DB-embedded/Local | ✅ Working |
| **Auth** | scrypt + HttpOnly cookies, 7-day sessions | ✅ Working |
| **Frontend** | Vanilla JS SPA, hash router, Service Worker | ✅ Complete |
| **AI/Insights** | Rule-based (extraction, trends, signals) | ✅ Complete |
| **Multi-role** | Patient / Doctor / Store Owner / Admin | ✅ Complete |

---

# 2. Critical Gaps for Production

## 🔴 Critical (Block Launch)

| Gap | Impact | Effort |
|-----|--------|--------|
| **No relational DB** — full-state JSON writes won't scale past ~1k users | Data corruption, no concurrency, no indexes | 1 day |
| **No HTTPS enforcement** — cookies not Secure, no HSTS | Session hijacking, MITM | 2 hrs |
| **No password reset** — users locked out permanently | User abandonment | 4 hrs |
| **No email notifications** — reminders, consults, SOS silent | Core features broken | 4 hrs |
| **No observability** — blind in production | Can't debug, no alerts | 1 day |

## 🟡 High (Degrade Experience)

| Gap | Impact | Effort |
|-----|--------|--------|
| No MFA | Credential stuffing risk | 4 hrs |
| No CSRF protection | State-changing attacks | 2 hrs |
| No family sharing | Major user value missing | 4 hrs |
| No load testing | Unknown capacity | 2 hrs |
| No legal docs (Privacy/Terms) | Compliance risk | 2 hrs |

---

# 3. 4-5 Day Execution Plan

## Day 1: Infrastructure & Database Migration
- Provision Supabase + Cloudinary
- Design & run Postgres migration (30 tables)
- Deploy to Railway/Render + custom domain + TLS
- Verify cloud file storage end-to-end

## Day 2: Auth Hardening & Email
- Security headers (HSTS, Secure cookies, CSP)
- CSRF tokens + rate limiting on all mutating endpoints
- Password reset flow (Resend, signed JWT tokens)
- Email templates: reset, welcome, consult, reminder, SOS

## Day 3: MFA + Family Sharing + Observability
- TOTP MFA (enable/verify/disable + backup codes)
- Family invite system (signed tokens, email links)
- Structured logging (pino) → Better Stack
- Error tracking (Sentry) + custom metrics + UptimeRobot

## Day 4: Polish, Load Test, Legal
- Accessibility audit (axe-core, WCAG 2.1 AA)
- Onboarding flow + mobile responsiveness
- k6 load test (100 concurrent, p95 < 500ms)
- Privacy Policy, Terms, GDPR DPA, medical disclaimer

## Day 5: Buffer + Launch
- CI/CD pipeline (GitHub Actions)
- Smoke tests (Playwright)
- Production deploy + 2hr monitoring
- Runbooks, rollback plan, hand-off doc

---

# 4. Database Migration Strategy

## Target Schema: 30 Relational Tables

```sql
-- Core user tables
users, sessions, profiles, family_members

-- Health data
reports, metrics, lifestyle_logs, plans

-- Care team
doctors, contacts, reminders, sos_alerts

-- Settings & audit
settings, audit_logs, feedback

-- Multi-role
doctor_accounts, store_owner_accounts, stores

-- Consultations
consult_tickets, consult_appointments, consult_messages

-- Family invites
family_invites
```

## Migration Approach
1. **Parallel write** during transition (dual-write to JSON + Postgres)
2. **Backfill** historical data via script
3. **Cutover** — switch `db.js` to Kysely query builder
4. **Verify** — run test suite against Postgres
5. **Remove** JSON persistence code

## Indexes for Performance
```sql
CREATE INDEX idx_metrics_user_key_date ON metrics(user_id, key, date);
CREATE INDEX idx_audit_user_ts ON audit_logs(user_id, ts DESC);
CREATE INDEX idx_reports_user_uploaded ON reports(user_id, uploaded_at DESC);
```

---

# 5. Security Hardening Details

## Authentication Upgrades

| Feature | Implementation |
|---------|----------------|
| **Password Reset** | `POST /auth/forgot-password` → email with 15-min JWT → `POST /auth/reset-password` |
| **MFA (TOTP)** | `otplib` — QR code in settings, 8 backup codes, required on login if enabled |
| **Session Security** | `Secure` + `HttpOnly` + `SameSite=Lax` cookies, 7-day expiry, revoke on password change |
| **Rate Limiting** | Sliding window: 5 req/min on auth, 30 req/min on uploads, 10 req/min on feedback |

## Transport & Headers

```javascript
// Production-only headers
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.clarity.ms; ...
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

## CSRF Protection
- Double-submit cookie pattern
- Token in `<meta name="csrf-token">` + `X-CSRF-Token` header
- Validate on all `POST/PUT/PATCH/DELETE`

---

# 6. Observability Stack

## Logging (Better Stack — Free Tier)
```json
{
  "level": "info",
  "reqId": "abc123",
  "userId": "usr_xyz",
  "method": "POST",
  "path": "/api/reports",
  "status": 200,
  "latencyMs": 142,
  "msg": "Report uploaded"
}
```
- Structured JSON via `pino`
- Request ID propagation
- User context (no PII in logs)

## Error Tracking (Sentry — Free Tier)
- Auto-capture unhandled exceptions
- Source maps uploaded in CI
- Alert on new error types

## Metrics (Custom + Better Stack)
| Metric | Target |
|--------|--------|
| `api_latency_p95` | < 500ms |
| `api_error_rate` | < 0.1% |
| `active_users_24h` | Track growth |
| `report_uploads_total` | Business metric |
| `consult_volume` | Business metric |

## Uptime Monitoring (UptimeRobot)
- `/api/health` every 60s
- Alert on 3 consecutive failures
- Status page for users

---

# 7. Launch Checklist (Go/No-Go)

## Pre-Deploy Verification

| Check | Pass Criteria |
|-------|---------------|
| **Unit tests** | `npm test` → 100% pass |
| **Migration verified** | All seed data queryable in Postgres |
| **File upload** | PDF → Supabase Storage → download works |
| **Auth flow** | Register → login → MFA → reset password → logout |
| **Email delivery** | Reset, welcome, SOS alert received in inbox |
| **Family invite** | Link expires in 7 days, accepts correctly |
| **Admin panel** | User list, drill-down, audit log, delete |
| **Doctor portal** | Dashboard, verification, consult management |
| **Store portal** | Dashboard, inventory, orders |
| **Accessibility** | axe-core: 0 violations WCAG 2.1 AA |
| **Load test** | k6: 100 VUs, 5 min, p95 < 500ms, 0% errors |
| **Security scan** | OWASP ZAP: 0 high/critical findings |

## Production Deploy

- [ ] GitHub Actions: lint → test → build → deploy staging → manual promote
- [ ] DNS cutover to production domain
- [ ] SSL Labs grade A+
- [ ] All env vars set in production (no `.env` files)
- [ ] Supabase PITR enabled + tested restore
- [ ] Better Stack alerts configured
- [ ] Sentry project linked
- [ ] UptimeRobot monitor active

## Post-Deploy (First 2 Hours)

- [ ] Smoke test: auth, upload, consult, SOS, admin
- [ ] Error rate < 0.1% in Sentry
- [ ] Latency p95 < 500ms in Better Stack
- [ ] No 5xx in logs
- [ ] Email delivery confirmed
- [ ] Team on-call for 4 hours

---

# 8. Post-Launch Roadmap

## Week 2: Stabilize & Listen
- User feedback collection (in-app + email)
- Performance optimization from real traffic
- Bug fixes from launch week
- Documentation updates

## Month 1: Core Enhancements
- FHIR export for clinical interoperability
- Mobile app (Capacitor wrapper → iOS/Android)
- Doctor portal: schedule management, prescriptions
- Pharmacy integration (eRx standards)

## Quarter 1: Scale & Differentiate
- Insurance claims helper
- AI-enhanced insights (fine-tuned on anonymized data)
- Multi-language support (i18n)
- Enterprise features (SSO, audit logs API, white-label)

---

# Appendix: Tech Debt Tracker

| Item | Priority | Estimate | Owner |
|------|----------|----------|-------|
| Replace vanilla JS with React/Vue | Low | 2 weeks | Frontend |
| Background job queue (BullMQ) | Medium | 3 days | Backend |
| Connection pooling (PgBouncer) | Medium | 1 day | Infra |
| Automated DB backups test | High | 2 days | Infra |
| Integration test suite (Playwright) | Medium | 1 week | QA |
| Design system extraction | Low | 1 week | Design |

---

# Questions & Decisions Needed

1. **Hosting target**: Railway/Render (VM) vs Vercel (serverless)?
2. **Email provider**: Resend (recommended) vs SendGrid vs AWS SES?
3. **MFA mandatory?** Optional for now, required for admin?
4. **Family sharing default**: Viewer or Editor role?
5. **Data retention**: 7 years? GDPR right-to-delete compatible?
6. **HIPAA assessment needed?** (Likely no BAA without enterprise)
7. **Launch date commitment**: Internal beta → Public beta → GA?

---

# Contact & Resources

- **Repo**: `github.com/HealthSphere/HealthSphere_AI`
- **Staging**: `https://staging.healthsphere.ai` (after Day 1)
- **Production**: `https://healthsphere.ai` (after Day 5)
- **Monitoring**: Better Stack, Sentry, UptimeRobot dashboards
- **Runbooks**: `docs/runbooks/` (created Day 5)
- **Escalation**: [Team lead] → [Engineering manager] → [CTO]

---

*Prepared for HealthSphere AI Production Readiness Sprint*
*Version 1.0 — Ready for execution*