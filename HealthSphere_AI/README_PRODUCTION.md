# HealthSphere AI — Production Readiness Sprint
## Complete Toolkit Delivered

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `PRODUCTION_PLAN.md` | Detailed 4-5 day execution plan with schema, code changes, checklists |
| `PRODUCTION_PPT.md` | Marp-compatible presentation (export to PPTX/PDF) |
| `marp-theme.css` | Custom theme for presentation |
| `scripts/setup-production.ps1` | PowerShell daily verification script |
| `scripts/migrate-to-postgres.mjs` | JSON → Postgres migration script |
| `.github/workflows/ci-cd.yml` | Complete CI/CD pipeline (lint → test → a11y → security → load → deploy) |
| `scripts/load-test.js` | k6 load test (100 VUs, p95 < 500ms, error rate < 0.1%) |

---

## 🚀 Quick Start (Run Today)

### 1. Export Presentation
```bash
# Install Marp CLI
npm install -g @marp-team/marp-cli

# Export to PPTX
npx @marp-team/marp-cli@latest PRODUCTION_PPT.md --output production.pptx --theme-set ./marp-theme.css

# Or PDF
npx @marp-team/marp-cli@latest PRODUCTION_PPT.md --output production.pdf --theme-set ./marp-theme.css
```

### 2. Run Day 1 Checks
```powershell
# From HealthSphere_AI directory
.\scripts\setup-production.ps1 -Day 1
```

### 3. Run Migration (After Provisioning Supabase)
```bash
# Set env vars first
export SUPABASE_DB_URL="postgresql://..."
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ..."
export SUPABASE_STORAGE_BUCKET="reports"
export CLOUDINARY_CLOUD_NAME="..."
export CLOUDINARY_API_KEY="..."
export CLOUDINARY_API_SECRET="..."
export ADMIN_EMAILS="you@domain.com"

# Run migration
node scripts/migrate-to-postgres.mjs
```

### 4. Run Local Load Test
```bash
# Install k6
# Windows: choco install k6
# Mac: brew install k6
# Linux: sudo apt install k6

k6 run scripts/load-test.js -e BASE_URL=http://localhost:3000
```

---

## 📅 Day-by-Day Commands

### Day 1: Infrastructure
```powershell
.\scripts\setup-production.ps1 -Day 1
# Then manually: provision Supabase, Cloudinary, deploy to Railway/Render
```

### Day 2: Auth & Email
```powershell
.\scripts\setup-production.ps1 -Day 2
# Add RESEND_API_KEY, EMAIL_FROM, APP_URL to env
```

### Day 3: MFA + Observability
```powershell
.\scripts\setup-production.ps1 -Day 3
# Add SENTRY_DSN, BETTER_STACK_*, UPTIMEROBOT_API_KEY
```

### Day 4: Polish & Legal
```powershell
.\scripts\setup-production.ps1 -Day 4
# Creates docs/PRIVACY.md, docs/TERMS.md, docs/DPA.md
```

### Day 5: Launch
```powershell
.\scripts\setup-production.ps1 -Day 5
# Triggers CI/CD workflow for production deploy
```

---

## 🔑 Required Secrets (GitHub Actions)

| Secret | Source | Required For |
|--------|--------|--------------|
| `SUPABASE_DB_URL` | Supabase Project → Settings → Database | Migration, Runtime |
| `SUPABASE_URL` | Supabase Project → Settings → API | File storage |
| `SUPABASE_SERVICE_KEY` | Supabase Project → Settings → API | File storage, Admin |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage (create "reports" bucket) | File uploads |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard | File uploads (fallback) |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard | File uploads |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard | File uploads |
| `ADMIN_EMAILS` | Your admin email(s), comma-separated | Admin panel access |
| `RESEND_API_KEY` | Resend.com → API Keys | Email notifications |
| `EMAIL_FROM` | Verified domain in Resend | Email sender |
| `APP_URL` | Your production domain | Password reset links |
| `SENTRY_DSN` | Sentry.io → Project → Settings | Error tracking |
| `BETTER_STACK_SOURCE_TOKEN` | Better Stack → Sources | Log aggregation |
| `BETTER_STACK_INGEST_HOST` | Better Stack → Sources | Log ingestion |
| `UPTIMEROBOT_API_KEY` | UptimeRobot → My Settings | Uptime monitoring |
| `RAILWAY_PROJECT_ID` / `RAILWAY_TOKEN` | Railway.app → Account → Tokens | Deploy |
| `SLACK_WEBHOOK` | Slack → Apps → Incoming Webhooks | Notifications |
| `VERCEL_TOKEN` (alt) | Vercel → Settings → Tokens | Deploy alternative |

---

## 🎯 Success Criteria (Definition of Done)

| Category | Metric | Target |
|----------|--------|--------|
| **Reliability** | Uptime | 99.9% |
| **Performance** | API p95 latency | < 500ms |
| **Performance** | Report upload p95 | < 3s |
| **Quality** | Error rate | < 0.1% |
| **Security** | OWASP ZAP | 0 High/Critical |
| **Accessibility** | axe-core | 0 WCAG 2.1 AA violations |
| **Testing** | Unit tests | 100% pass |
| **Testing** | Load test | 100 VUs, 5 min, all thresholds pass |

---

## 📞 Support & Escalation

| Issue | Contact | SLA |
|-------|---------|-----|
| Deployment failure | DevOps lead | 30 min |
| Database issues | Backend lead | 1 hour |
| Security incident | Security lead | 15 min |
| User-facing outage | On-call engineer | 5 min |

---

## 📚 Next Steps After Launch

1. **Week 1**: Monitor, fix bugs, gather feedback
2. **Week 2**: FHIR export, mobile wrapper (Capacitor)
3. **Month 1**: Doctor portal enhancements, pharmacy integration
4. **Quarter 1**: AI insights v2, multi-language, enterprise features

---

**Ready to execute?** Start with Day 1 checks and Supabase provisioning. The migration script is tested and ready — just add your connection string.