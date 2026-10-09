# Fix log

## Batch 1 — Security and data loss (2026-10-09)

Stopped for owner approval before Batch 2.

### Findings

| Finding | Status | Files changed | Tests added | Commit |
|---------|--------|---------------|-------------|--------|
| DATA-01 / DATA-07 | FIXED | `persistenceDelete.js`, `persistence.js`, `persistenceDelete.test.js` | row-fail skips storage; storage-fail returns `orphanedPath`; both ok | `21fd48f` |
| SEC-02 | FIXED (hygiene; severity treated as Medium per owner) | `_shared/corsLogic.js`, `cors.ts`, `corsLogic.test.js` | allowlist reflect / omit | `e4791ba` |
| SEC-01 | FIXED | `validateRequest.js`, `validateRequest.test.js` | 413/415/400 cases | `0ab5a9e` |
| SEC-03 | FIXED | `refundUsage.js`, migration `20261009153000_…`, `schema.sql`, `hardening.sql`, `OWNER_ACTIONS.md` | refund once / no leak / floor at 0 | `4099d36`, `f8810ad` |
| SEC-04 | FIXED | `sanitizeTags.js`, `suggest-garment/index.ts` (wires SEC-01..04) | injected keys, long label, scarf category, markup, non-JSON | `ee6e24e` |
| DATA-02 | FIXED | `sampleAppend.js`, `persistence.js`, `App.jsx`, `WardrobeTab.jsx` | second append → 0 rows; empty/DEV gate | `d990fb2` |
| DATA-05 | FIXED | `submitLock.js`, `BulkUploadSection.jsx`, Wardrobe/App locks, wardrobe upsert | sync lock → one insert | `bca2007` |

Bucket MIME SVG removal: migration file `supabase/migrations/20261009153100_wardrobe_bucket_mime.sql` + OWNER_ACTIONS (not applied remotely).

### Checks after Batch 1

```
npm run test  → 11 files, 67 passed
npm run lint  → warning only: unused CATEGORIES in suggestTags.js (Batch 4)
npm run build → OK; JS ~516 kB gzip ~152 kB; chunk size warning remains
```

### Deferred

- Live deploy of Edge Function, secrets (`ALLOWED_ORIGINS`, `SUGGEST_GARMENT_MAX_IMAGE_BYTES`), refund migration, bucket MIME update, dashboard JWT/sign-up checks → **owner** (`docs/audit/OWNER_ACTIONS.md`).
- Batches 2–4 findings unchanged.

### Missed by audit / noted while fixing

- Wiring for SEC-01/02/03 lives in the SEC-04 commit (`index.ts`); modules landed in earlier commits.
- `DATA-02` / `DATA-05` commits also included previously uncommitted wardrobe/bulk UI that was already in the working tree (not introduced by these findings). Prefer committing feature branches before audit fix batches next time.
- Over-cap path now refunds the speculative increment so the counter does not climb past the cap on 429 responses.
- Client `insertWardrobeItem` now `upsert`s on `id` so retries with a stable draft/bulk id do not duplicate rows.
