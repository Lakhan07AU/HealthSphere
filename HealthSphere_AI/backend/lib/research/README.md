# HealthSphere Research Hub

Global medical research, disease intelligence and health-education module.
It ingests articles from official key-less sources, normalizes and
de-duplicates them, classifies evidence, holds high-risk content for human
review, and generates an educational, schema-validated summary for every
published record.

This module follows the project's existing conventions: a **zero-dependency
Node.js backend** (no Python/FastAPI/Celery/Redis), a JSON-file store with
atomic writes, and a vanilla-JS frontend. It shares nothing with the health
record store so research volume never bloats patient data.

## Architecture

```
connectors.js   → fetch + normalize → normalize.js → store.js (research.json)
                                        │
                                        ├── schema.js   (states, evidence, safety flags)
                                        └── summarize.js (offline extractive AI)
                                                          ↑
scheduler.js  (per-source interval timers, mutex, graceful shutdown)
api.js        (researchRoutes: patient + admin endpoints)
```

| File | Responsibility |
| --- | --- |
| `store.js` | Persistence (atomic JSON write with Windows-safe rename retry), retention bounds, review/sync audit trails. |
| `schema.js` | Publication state machine, evidence categories, high-risk detection, validation, public projection. |
| `normalize.js` | Raw record → internal article, topic classification, cross-source de-duplication. |
| `connectors.js` | Europe PMC, ClinicalTrials.gov, PubMed E-utilities, WHO DON (RSS); shared fetch with timeout/retry/backoff; per-source rate limiting; source registry. |
| `summarize.js` | Provider interface (`offline` default, `http` stub), schema validation, source-forgery guardrail, content-hash caching. |
| `scheduler.js` | Background sync + post-processing (classify → review or auto-publish). |
| `api.js` | `researchRoutes` registry consumed by `lib/api.js`. |

## Data flow / publication states

```
discovered → ingested → processing ┬─(high-risk flags)→ pending_review → published | rejected
                                   └─(safe content)───→ summary_pending_review → published
published → corrected | retracted | archived
rejected  → archived
```

High-risk flags that always force human review: `possible-cure-claim`,
`outbreak-warning`, `treatment-interference`, `investigational-therapy`,
`preprint`. Only sources with `trustTier: 'official'` may populate the
Disease Watch alert feed.

## Sources

| Source | Type | Trust | Default interval | Rate limit |
| --- | --- | --- | --- | --- |
| Europe PMC | REST (key-less) | official | 15 min | 700 ms |
| ClinicalTrials.gov v2 | REST (key-less) | official | 15 min | 400 ms |
| PubMed E-utilities | REST (key-less) | official | 15 min | 400 ms (×3/s NCBI guideline) |
| WHO Disease Outbreak News | RSS | official | 30 min | 1000 ms |
| CDC / MoHFW / ICMR | manual | official | — | admin entry only |

CDC, MoHFW and ICMR are registered as **manual** connectors because no stable,
key-less public feed was confirmed at implementation time. They are not
scraped; an admin adds their bulletins by hand via the API. Enable them from
**Admin → Research Sources** when an approved feed is available.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `RESEARCH_ENABLED` | `true` | Set to `false` to disable the background scheduler entirely. |
| `RESEARCH_DATA_DIR` | `backend/data/research` | Directory for `research.json`. |
| `AI_PROVIDER` | `offline` | `offline` (deterministic extractive, no network) or `http` (stub, not wired to any paid service). |
| `ADMIN_EMAILS` | `admin123@healthsphere.ai` | Comma-separated admin allow-list (shared with the rest of the app). |

## API

Patient (authenticated): `GET /api/research/articles`, `GET /api/research/articles/:id`,
`GET /api/research/articles/:id/summary`, `GET /api/research/diseases`,
`GET /api/research/topics`, `GET /api/research/search`,
`GET|PUT /api/research/preferences`, `GET|POST|DELETE /api/research/saved[/:id]`.

Admin (`ADMIN_EMAILS`): `GET|POST /api/admin/research/sources`,
`PATCH /api/admin/research/sources/:id`, `POST /api/admin/research/sources/:id/sync`,
`GET /api/admin/research/reviews`,
`POST /api/admin/research/articles/:id/{approve|reject|correct|retract|archive}`,
`POST /api/admin/research/articles`, `GET /api/admin/research/sync-logs`.

## Feature flag / graceful degradation

- No AI key needed: the default provider is deterministic and offline.
- If a source is unreachable, `syncSource` never throws; the failure is logged
  to the sync log and retried on the next interval.
- Short or missing abstracts are marked `insufficient` evidence — the
  summarizer never fabricates findings.

## Tests

```
cd backend && npm test
```

Research suites: `research-schema`, `research-normalize`, `research-summarize`,
`research-connectors`, `research-api`.
