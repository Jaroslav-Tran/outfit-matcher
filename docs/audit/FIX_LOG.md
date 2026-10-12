# Fix log

## Batch 3 — Robustness and error handling (2026-10-12)

Stopped for owner approval before Batch 4.

### Findings

| Finding | Status | Files | Tests | Commit |
|---------|--------|-------|-------|--------|
| LOOP-01 | FIXED | `outfitGenerator.js`, `OutfitTab.jsx` | last-added over-cap; order-independent; small closet | `be5ce33` |
| DATA-03 | FIXED | `App.jsx`, Wardrobe/Bulk/Outfit | hydrating disables actions | `096940d` |
| DATA-04 | FIXED | `signedUrlRefresh.js`, `persistence.js`, App/imgs | resign guard ≤1/window | `a73832a` |
| ERR-01 | FIXED | `ErrorBoundary.jsx`, `main.jsx` | getDerivedStateFromError + log | `bb70dff` |

### LOOP-01 timing (large synthetic closet ~61 items)

| Metric | Before (audit) | After prune |
|--------|----------------:|------------:|
| Raw combo estimate (max accessories 2) | ~9.8M | — |
| Plan | truncate @ 50k | accessories=0, top-K=8, est. 41 472 |
| `generateOutfits` wall time (Node) | ~1300 ms | **~168 ms** |
| Sample closet | — | ~8 ms |

Web Worker **not** added (under 300 ms threshold after pruning). Async UI path yields every 2000 leaves via `generateOutfitsAsync`.

### Checks after Batch 3

```
npm run test  → 13 files, 84 passed
npm run lint  → unused CATEGORIES warning only
npm run build → OK
```

---

## Batch 2 — Core-logic correctness (2026-10-09)

Stopped for owner approval before Batch 3.

### Findings

| Finding | Status | Files | Tests | Commit |
|---------|--------|-------|-------|--------|
| LOGIC-01 | FIXED | `outfitGenerator.js` (+tests) | Cream Whisper ~+17–20 Neutral; black ~0 | `10cf3eb` |
| LOGIC-02 / 03 / 04 / 07 / DOC-01 | FIXED | `README.md`, `OutfitTab.jsx`, App/Auth captions | docs only | `4b9f59d` |
| LOGIC-05 | FIXED | `colorUtils.js` | greys → mono; grey+hue; low-chroma neutral | `c0d4eb0` |
| LOGIC-06 | FIXED | union-find in `colorUtils.js` | 6 orderings + greedy contrast | `c0d4eb0`, `fd090a5` |
| LOOP-02 | FIXED | `outfitGenerator.js` | mid-layer tip once | `7f19685` |

### LOGIC-01 palette dominance (seed closet, no weight retune)

Valid sample-closet combos: **65**.

| Metric | Min | Median | Max |
|--------|----:|-------:|----:|
| Palette points (sum) | 60 | 80 | 80 |
| Σ \|style adjustments\| | 0 | 2 | 2 |

- **100%** of combos have palette points ≥ abs style sum.
- **100%** have palette points ≥ 4 (typical fit/layer penalty magnitude).
- UI best looks: palette ~60–80 vs style 0–2.

**Palette dominates.** Options for the owner (do not implement until chosen):

1. **Average** palette points over items instead of sum (before/after: rankings compress; 3-piece neutrals no longer beat 5-piece stacks by default).
2. **Per-item cap** (e.g. max 8 instead of 20) — softens exact palette matches.
3. **Scale factor** (e.g. `0.25 × Σ`) — keeps sum shape, shrinks vs ±2…−5 style terms.

Recommend measuring those three on 5 Generate runs after Batch 3 generator work, then pick one.

### Checks after Batch 2

```
npm run test  → 11 files, 76 passed
npm run lint  → unused CATEGORIES warning only
npm run build → OK
```

---

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
