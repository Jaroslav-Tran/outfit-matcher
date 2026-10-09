# Outfit Matcher — Audit Report

**Scope:** `outfit-matcher/` (app, `supabase/`, GitHub Actions).  
**Method:** Static reading + `npm ci` / `build` / `test` / `lint` / `audit` + targeted Node probes (palette ΔE, generator timing).  
**Date:** 2026-10-09  
**Batch 1 status:** code fixes committed locally; Edge Function / SQL / bucket MIME require owner actions in `docs/audit/OWNER_ACTIONS.md`.

---

## Executive summary

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 6 |
| Medium | 14 |
| Low | 7 |

**Top 5 (plain language)**

1. **Perfect palette colors score as neutrals.** Warm Sand, Caramel Latte, Cream Whisper, and Stone Gray sit within ΔE 12 of the hardcoded neutral list, so upload auto-checks Neutral and those pieces contribute **zero** palette-closeness points.
2. **Large closets freeze the UI.** With mid-layer, raw combo counts routinely exceed 50k; enumeration truncates but still walks up to 50k combos **synchronously** on the main thread (~1.3s in Node for a ~60-slot closet; phones will feel worse).
3. **Delete can destroy the photo while keeping (or restoring) the row.** Storage `remove` runs before the row delete and its result is ignored; a failed row delete rolls UI state back to an item whose file is already gone.
4. **Edge Function cost / abuse surface.** `suggest-garment` allows CORS `*`, has no server-side image/body size cap, increments the daily counter **before** calling Claude, and returns raw Anthropic error bodies.
5. **README formality / layering text disagrees with the generator.** Docs say every piece shares one tier and omit mid-layer from the combo formula; code allows outerwear one tier above the top, requires mid-layer exact match, and scores mid-layer in fit/warmth.

**Go / no-go:** **Conditional go for personal single-user use** of real closet data (RLS and auth identity look sound; no secrets found in repo or `dist/`). **No-go for wider sharing or treating AI tagging as hardened** until Batch 1 (photo-delete ordering, Edge Function limits/CORS, sample-data guardrails) lands. Core outfit ranking is usable but systematically wrong for several of your own palette hexes until LOGIC-01 is fixed.

---

## System map (Phase 0)

### Inventory

| Area | Entries |
|------|---------|
| **Entry** | `index.html` → `src/main.jsx` → `App.jsx` (StrictMode) |
| **Components** | `AuthScreen`, `PaletteTab`, `WardrobeTab`, `BulkUploadSection`, `OutfitTab`, `CategoryPills`, `SeasonPills`, `SegmentedControl`, `Switch`, `ThemeToggle` |
| **Lib** | `outfitGenerator`, `colorUtils`, `persistence`, `bulkUpload`, `suggestTags`, `imageUtils`, `weather`, `sampleData`, `exportCloset`, `constants`, `theme`, `supabase` |
| **Hooks** | `useTheme` |
| **Supabase tables** | `palette_colors`, `wardrobe_items`, `edge_function_usage` |
| **Bucket** | `wardrobe` (private; 2 MB; jpeg/png/webp/svg) |
| **Policies** | `palette_own_all`, `wardrobe_own_all`; storage `wardrobe_{select,insert,update,delete}_own` |
| **RPC** | `increment_edge_function_usage(fn_name text)` (security definer) |
| **Edge Function** | `suggest-garment` (+ `_shared/cors.ts`) |
| **Migrations** | `schema.sql`, `hardening.sql`, `migration_last_worn.sql`, `migration_layering.sql`, `migration_palette_hex_unique.sql` |
| **CI** | `.github/workflows/deploy-pages.yml` → Pages |

### State ownership / source of truth

| Data | Runtime home | Durable SoT |
|------|--------------|-------------|
| Session user | `App` `user` + Supabase Auth | Auth |
| Palette / wardrobe / reference URL | `App` `useState` | Postgres + Storage |
| Signed image URLs | In-memory on each item (`imageUrl`) | Re-created on load (7-day TTL); **not** SoT |
| Theme preference | `localStorage` `outfit-matcher-theme` | localStorage |
| Weather cache | Module var in `weather.js` | Session-only memory |
| Bulk pending cards | `BulkUploadSection` state + blob preview URLs | Session-only until Save |
| Draft add-item photo | `WardrobeTab` `draft` | Session |
| UI filters / generate results | `OutfitTab` local state | Ephemeral |
| Service worker cache | — | **None** (no PWA / SW in repo) |

### `useEffect` inventory

| Location | Deps | Sets / side effects |
|----------|------|---------------------|
| `App.jsx` ~53–57 | `[]` | Cleanup: revoke wardrobe blob URLs on unmount |
| `App.jsx` ~59–75 | `[menuOpen]` | Document click/keydown listeners; closes menu |
| `App.jsx` ~77–95 | `[]` | `setUser`, `setAuthReady`; auth subscription |
| `App.jsx` ~97–132 | `[user]` | Clears or loads palette/wardrobe/reference; `setHydrating`, `setPersistError` |
| `OutfitTab.jsx` ~53–56 | `[palette, formalityFilter, seasonFilter, weather]` | `setResults(null)`, `setMarkNotice('')` |
| `WardrobeTab.jsx` ~176–180 | `[hex]` | `setIsNeutral(isSuggestedNeutral(hex))` |
| `WardrobeTab.jsx` ~182–187 | `[draft?.objectUrl]` | Cleanup revoke + confirm timer |
| `BulkUploadSection.jsx` ~56–61 | `[]` | Cleanup revoke all preview URLs |
| `PaletteTab.jsx` ~30+ | (local draft/extract) | Local UI only |
| `useTheme.js` ~13–25 | `[preference]` | `applyTheme`, `persistPreference`, `matchMedia` listener |

### Async → state setters (representative)

`loadPalette`/`loadWardrobe` → `setPalette`/`setWardrobe`; optimistic `add*`/`remove*`/`update*`/`markOutfitWorn` with rollback on catch; `loadSampleData` → replace lists with append result; bulk `processOne` / save → `setItems`; weather → `setWeather`; generate → `setResults`.

### Environment variables

| Name | Where | Client-bundled? |
|------|-------|-----------------|
| `VITE_SUPABASE_URL` | `.env.local`, GH Actions secrets | **Yes** (public) |
| `VITE_SUPABASE_ANON_KEY` | same | **Yes** (public anon/publishable) |
| `ANTHROPIC_API_KEY` | Supabase Edge secrets only | No |
| `SUGGEST_GARMENT_DAILY_CAP` | Edge secrets | No |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Edge runtime | No |
| `GITHUB_REPOSITORY` | Actions → Vite `base` | Build-time only |

### Outbound network

- Supabase Auth / PostgREST / Storage / `functions/v1/suggest-garment`
- Anthropic `api.anthropic.com` (Edge only)
- Open-Meteo `api.open-meteo.com/v1/forecast` (browser; lat/lon as given)

### Tooling run (recorded)

```
npm ci          → 58 packages; 1 high severity noted at install
npm run build   → OK; JS 513.99 kB / gzip 151.23 kB; CSS 16.69 kB; chunk >500 kB warning
npm run test    → 4 files, 39 tests passed
npm run lint    → warning: unused import CATEGORIES in suggestTags.js
npm audit       → high: source-map-js 1.0.0–1.2.1 (GHSA-68fv-2mgg-jv7q); fixAvailable
dist/ secret scan → no sk-ant / service_role / ANTHROPIC
git sk-ant / service_role → none found in searched history
XSS sinks (dangerouslySetInnerHTML / innerHTML / document.write) → none in src/
```

---

## Findings table

| ID | Sev | Conf | Category | Location | Status |
|----|-----|------|----------|----------|--------|
| LOGIC-01 | High | CONFIRMED | Conflicting logic | `colorUtils.js` + `sampleData.js` | FIXED `10cf3eb` (weights not retuned; see FIX_LOG) |
| LOOP-01 | High | CONFIRMED | Runaway work | `outfitGenerator.js` | (Batch 3) |
| DATA-01 | High | CONFIRMED | Data integrity | `persistence.js` delete path | FIXED `21fd48f` |
| SEC-01 | High | CONFIRMED | Security | `suggest-garment/index.ts` | FIXED `0ab5a9e` (+ wired in `ee6e24e`) |
| SEC-02 | Medium | CONFIRMED | Security (hygiene) | `cors.ts` + Edge Function | FIXED `e4791ba` (+ wired in `ee6e24e`); owner must set `ALLOWED_ORIGINS` |
| LOGIC-02 | High | CONFIRMED | Contradiction | README vs `outfitGenerator.js` formality | FIXED `4b9f59d` |
| DATA-02 | Medium | CONFIRMED | Data integrity | sample append / WardrobeTab | FIXED `d990fb2` |
| DATA-03 | Medium | LIKELY | Race / UX | `App.jsx` hydrating vs Generate | (Batch 3) |
| DATA-04 | Medium | CONFIRMED | State | signed URLs 7d in memory only | (Batch 3) |
| DATA-05 | Medium | LIKELY | Double-submit | WardrobeTab / sample button | FIXED `bca2007` |
| LOGIC-03 | Medium | CONFIRMED | Contradiction | README combo formula omits mid-layer | FIXED `4b9f59d` |
| LOGIC-04 | Medium | CONFIRMED | Contradiction | README fit stack vs code includes mid-layer | FIXED `4b9f59d` |
| LOGIC-05 | Medium | CONFIRMED | Logic | achromatic non-neutral → unclassified drop | FIXED `c0d4eb0` |
| LOGIC-06 | Medium | CONFIRMED | Logic | distinct-color count order-dependent | FIXED `c0d4eb0` / `fd090a5` |
| LOGIC-07 | Medium | CONFIRMED | Docs | scheme boundary at 20° / complementary band | FIXED `4b9f59d` |
| SEC-03 | Medium | CONFIRMED | Security | rate limit before Claude + error `detail` | FIXED `4099d36` / `f8810ad`; owner must run refund migration + redeploy |
| SEC-04 | Medium | CONFIRMED | Security | no server enum/label sanitize | FIXED `ee6e24e` |
| SEC-05 | Medium | CONFIRMED | Supply chain | `npm audit` source-map-js | (Batch 4) |
| ERR-01 | Medium | CONFIRMED | Error handling | no React error boundary | (Batch 3) |
| PRIV-01 | Medium | CONFIRMED | Privacy | Open-Meteo full coordinates | (Batch 4) |
| LOOP-02 | Low | CONFIRMED | Logic/UX | `midLayerAppendix` duplicated (neutral-only) | FIXED `7f19685` |
| DATA-06 | Low | CONFIRMED | Integrity | dual-category items appear in two grid groups | (Batch 4) |
| DATA-07 | Low | LIKELY | Orphans | storage remove error ignored on delete | FIXED `21fd48f` (with DATA-01) |
| PLAT-01 | Low | CONFIRMED | Platform | `100vh`; inputs OK at 17px | (Batch 4) |
| PLAT-02 | Low | CONFIRMED | Platform | Actions pinned by tag not SHA | (Batch 4) |
| DOC-01 | Low | CONFIRMED | Docs | Descoped list still denies length/warmth | FIXED `4b9f59d` |
| PERF-01 | Low | CONFIRMED | Perf | single ~514 kB JS chunk | (Batch 4) |

---

## Finding details

### LOGIC-01 — Palette “perfect” colors auto-flagged Neutral

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Conflicting logic  
- **Location:** `src/lib/colorUtils.js:81–84`, `2–15`; `src/lib/sampleData.js:8–21`; score loop `outfitGenerator.js:400–407`  
- **What is wrong:** Neutrals are excluded from palette Σ scoring. `isSuggestedNeutral` uses ΔE &lt; 12 against a list that includes beige/tan/grey. Several DEFAULT_PALETTE hexes collide, so the user’s own analysis colors earn zero palette points when left Neutral.  
- **Evidence (Node probe, chroma CIEDE2000):**

  | Palette color | Hex | Near-neutral? | Closest neutral | ΔE |
  |---|---|---|---|---|
  | Warm Sand | `#D5BBA7` | **true** | `#D2B48C` | 7.00 |
  | Caramel Latte | `#BD996F` | **true** | `#D2B48C` | 7.63 |
  | Cream Whisper | `#EEE0D1` | **true** | `#D3D3D3` | 8.67 |
  | Stone Gray | `#979797` | **true** | `#A9A9A9` | 5.51 |
  | Chocolate Bronze | `#735742` | false | `#8B4513` | 12.33 |
  | Rich Olive / Deep Sage | … | false | … | &gt;15 |

- **Impact:** Outfits built from “perfect” wardrobe colors rank as if they had no palette affinity.  
- **Proposed fix:** Narrow `NEUTRALS` (drop fashion beiges/olives that overlap the analysis set) **or** never auto-neutral a hex within ΔE 12 of any palette color; keep checkbox editable. Prefer: `isSuggestedNeutral(hex) && !palette.some(p => deltaE(hex,p.hex) < 12)`.  
- **Alternatives:** Raise threshold only for beige/tan; require explicit Neutral.  
- **Regression risk:** Some true neutrals near palette sand/grey may need manual Neutral.  
- **Test:** `isSuggestedNeutral` / upload effect with DEFAULT_PALETTE hexes → Neutral false when in palette.

### LOOP-01 — Sync enumeration up to 50k freezes UI; accessory fallback never goes to 0

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Infinite loops / runaway work  
- **Location:** `outfitGenerator.js:23`, `86–101`, `144–185`, `451–466`  
- **What is wrong:** Cap is computed from **raw** slot counts, then max accessories drops 2→1 only (never 0). Enumeration still hard-stops at `combos.length >= cap` inside nested loops, then scores up to 50k candidates on the main thread. No infinite accessory loop. Mid-layer multiplies the product sharply.  
- **Evidence:** Seeded closet 10×10×10 tops/bottoms/shoes + 8 mid + 8 outer + 15 accessories: `raw max2=9_801_000`, `max1=1_296_000`, `max0=81_000`; `generateOutfits` ~**1300 ms** in Node, logs both cap warnings.  
- **Impact:** Generate click janks/freezes on realistic large closets; results may be an arbitrary first-50k slice of nested iteration order.  
- **Proposed fix:** Yield (`scheduler` / chunked async) or Web Worker; reduce accessories to **0** before truncating; prefer sampling / beam search over blind prefix truncation; show progress + disable Generate while running.  
- **Alternatives:** Lower cap; prefilter by formality/season before product.  
- **Regression risk:** Ranking changes if enumeration order/sampling changes.  
- **Test:** timing assertion or worker smoke; raw count with mid-layer; maxAccessories→0 path.

### DATA-01 — Delete removes Storage before row; no rollback of file

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Data integrity  
- **Location:** `persistence.js:255–266`; `App.jsx:223–234`  
- **What is wrong:**

```255:266:outfit-matcher/src/lib/persistence.js
export async function deleteWardrobeItemRow(userId, item) {
  if (item.imagePath) {
    await supabase.storage.from(BUCKET).remove([item.imagePath])
  }
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    ...
```

  UI optimistically removes the item; on row-delete failure it restores state, but the object may already be gone. Storage `remove` result is not `throwIfError`’d.  
- **Impact:** Broken images / silent photo loss while the row still exists.  
- **Proposed fix:** Delete row first, then storage; or storage-after-row in a try and surface storage errors; on failure after storage delete, do not silently restore without refetch.  
- **Alternatives:** Soft-delete column; background GC of orphans.  
- **Regression risk:** Temporary orphans if process dies after row delete (acceptable vs photo loss).  
- **Test:** mock storage ok + row fail → file still present or explicit error without fake restore.

### SEC-01 — No server-side image / body size limit on `suggest-garment`

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Security / cost  
- **Location:** `supabase/functions/suggest-garment/index.ts:63–98`  
- **What is wrong:** After auth + quota increment, `req.json()` accepts arbitrary `imageBase64` with no byte/length check before Anthropic. Client resizes to ~500px but the API does not enforce that. Searched function for size/limit checks: **absent**.  
- **Impact:** Authenticated caller (or stolen JWT) can burn Anthropic budget with large payloads within the daily cap.  
- **Proposed fix:** Reject if `imageBase64.length` &gt; N (e.g. ~1.5× client JPEG); enforce `Content-Length`; optionally re-check mime.  
- **Alternatives:** Lower `max_tokens` only (insufficient).  
- **Regression risk:** Legitimate large HEIC-transcoded paths may need a tuned limit.  
- **Test:** Deno/unit or integration: oversized body → 413 before Anthropic mock.

### SEC-02 — CORS `Access-Control-Allow-Origin: *`

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Security  
- **Location:** `supabase/functions/_shared/cors.ts:1–5`  
- **What is wrong:** Any origin may invoke the function from a browser if it has a valid user JWT (XSS on another site, malicious page, etc.).  
- **Evidence:**

```1:5:outfit-matcher/supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  ...
}
```

- **Impact:** Widens abuse of SEC-01/SEC-03 beyond first-party Pages + localhost.  
- **Proposed fix:** Reflect allowlist: `https://jaroslav-tran.github.io`, `http://localhost:5173`, `http://127.0.0.1:5173`.  
- **Alternatives:** Supabase dashboard CORS if available; keep `*` only in local Deno serve.  
- **Regression risk:** Preview deploy URLs need allowlist updates.  
- **Test:** OPTIONS/GET from disallowed Origin rejected.

### LOGIC-02 — Formality: README “one tier everywhere” vs outerwear +1 / mid exact

- **Severity:** High · **Confidence:** CONFIRMED · **Category:** Contradiction  
- **Location:** README ~43; `outfitGenerator.js:137–208`, `187–189`  
- **What is wrong:** README: every piece including accessories shares one tier. Code: outfit tier = **top’s** formality; bottom/shoes/accessories/mid-layer must equal that tier; outerwear may be same or **one step more formal**. Generate filter compares to top tier (so casual filter still allows smart-casual outerwear).  
- **Impact:** Docs mislead; “formal” filter behavior with elevated outerwear is subtle.  
- **Proposed fix:** Update README + OutfitTab copy to match code (recommended default), **or** change code to exact-match all slots.  
- **Alternatives:** Separate “outerwear formality” UI hint.  
- **Regression risk:** Tightening to exact-match drops many current looks.  
- **Test:** already partially covered (`outerwearFormalityAllowed` tests); add README-linked cases for accessories vs elevated outer.

### DATA-02 — Sample data appends duplicates; no confirm; production-reachable

- **Severity:** Medium · **Confidence:** CONFIRMED · **Category:** Data integrity  
- **Location:** `WardrobeTab.jsx:316–318`; `persistence.js:268–294`; `sampleData.js:25` (`crypto.randomUUID()` each call)  
- **What is wrong:** README correctly says append. Button has no confirm; each click inserts **new** wardrobe rows (new ids) — duplicate “Dusty Rose blouse” etc. Palette hexes are deduped; wardrobe is not. Reachable whenever signed in (including production).  
- **Impact:** Closet pollution / duplicate cards matching the reported screenshot symptom.  
- **Proposed fix:** Confirm dialog; hide behind `import.meta.env.DEV` or require empty wardrobe; dedupe wardrobe by label+hex+category.  
- **Alternatives:** Replace-with-wipe only in dev with typed confirm.  
- **Regression risk:** Low if gated.  
- **Test:** second `appendSampleData` adds 0 wardrobe rows when labels exist.

### DATA-03 — Generate usable while `hydrating`

- **Severity:** Medium · **Confidence:** LIKELY · **Category:** Race / UX  
- **Location:** `App.jsx:394–421`; `OutfitTab` always enabled  
- **What is wrong:** “Loading your wardrobe…” shows but tabs stay interactive; wardrobe may still be `[]` → empty generate result. Searched for `hydrating` disable on Generate: **absent**.  
- **Impact:** False “Not enough matching pieces” right after sign-in.  
- **Proposed fix:** Disable Generate (and Add) while `hydrating`; or don’t mount OutfitTab until loaded.  
- **Test:** manual: throttle network, click Generate during load.

### DATA-04 — Signed URLs expire mid-session; not refreshed

- **Severity:** Medium · **Confidence:** CONFIRMED · **Category:** State  
- **Location:** `persistence.js:24–28`, `159–171` (TTL `60*60*24*7`)  
- **What is wrong:** URLs live only in React state; no refresh timer; not in localStorage/export (good). After 7 days of continuous session (or clock skew), `<img>` breaks until reload.  
- **Impact:** Broken thumbnails until full reload.  
- **Proposed fix:** Refresh on `error` of img; or re-sign on focus if age &gt; 6 days.  
- **Test:** mock expired URL → onError resigns.

### DATA-05 — Double-click Add / sample can duplicate

- **Severity:** Medium · **Confidence:** LIKELY · **Category:** Double-submit  
- **Location:** `WardrobeTab.jsx:239–289` (`busy` after await start); sample button unsynchronized; ids = `crypto.randomUUID()` so retries insert, not upsert  
- **What is wrong:** Primary keys are client UUIDs (good for idempotent retry **if same id reused**); double-click creates two ids. Sample has no busy guard.  
- **Impact:** Duplicate rows.  
- **Proposed fix:** Disable buttons synchronously; reuse draft id across retries; sample mutex.  
- **Test:** rapid double submit → one insert mock.

### LOGIC-03 / LOGIC-04 — README combo + fit vs mid-layer in code

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** README ~39, ~79–86; `outfitGenerator.js:31`, `120–122`, `250–255`; OutfitTab lede mentions mid-layer  
- **What is wrong:** README combination line omits mid-layer; Descoped still says no length/weight (DOC-01). Fit volume stack in code includes mid-layer in `silhouette`; README says top/bottom/outerwear only.  
- **Proposed fix:** Align README with layering spec + code.  
- **Test:** doc-only; keep generator tests as source of truth.

### LOGIC-05 — Achromatic non-neutral → `unclassified` drop

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `colorUtils.js:96–99`, `120–134`  
- **What is wrong:** `hueOf` greys → NaN; two such hexes → `unclassified` → combo discarded (not crash).  
- **Evidence:** `detectColorScheme(['#808080','#c0c0c0'])` → `unclassified`.  
- **Impact:** Grey items left unchecked Neutral vanish from schemes.  
- **Proposed fix:** Treat non-finite hues as neutral-for-scheme or force Neutral suggestion for low-chroma.  
- **Test:** grey pair scheme classification.

### LOGIC-06 — Distinct-color count is order-dependent

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `colorUtils.js:156–165`  
- **What is wrong:** Greedy “first representative wins”; A≈B, B≈C, A≉C ⇒ count depends on iteration order (`combo.items` order).  
- **Impact:** Rare borderline outfits flip legal/illegal.  
- **Proposed fix:** Cluster with union-find on ΔE&lt;12 pairs.  
- **Test:** three hexes with non-transitive distances.

### LOGIC-07 — Scheme boundaries / complementary band

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `colorUtils.js:130–134`; README table ~53–55  
- **What is wrong:** Code: `<=20` mono, `<=60` analogous (so **20 = mono**). README analogous “20–60” overlaps. Complementary `150–210` with `circularHueDistance` max **180** ⇒ effective **150–180**; code does not require &gt;180 (OK). `chroma.deltaE` is **CIEDE2000** (`node_modules/chroma-js/src/utils/delta-e.js:5–8`); red–green ≈86.6.  
- **Proposed fix:** Docs: mono `≤20`, analogous `(20,60]`; complementary `150–180`.  
- **Test:** exact distance fixtures already partial.

### SEC-03 — Quota increments before Claude; Anthropic `detail` leaked

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `suggest-garment/index.ts:41–56`, `100–102`  
- **What is wrong:** Failed Claude calls still consume daily cap; `detail: await anthropic.text()` returned to client.  
- **Proposed fix:** Increment only on success **or** refund on upstream failure; return generic 502.  
- **Test:** mock Anthropic 500 → counter unchanged / no raw body.

### SEC-04 — Server returns unvalidated Claude JSON; label uncapped

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** Edge `return json(parsed)`; client `suggestTags.js:59–69` whitelists enums, `label.trim()` only  
- **What is wrong:** Prompt-injection via garment text cannot bypass client enums for saved tags if UI used, but label can be long/arbitrary; direct function callers get raw schema. No server whitelist.  
- **Proposed fix:** Server-side enum whitelist + label max length/strip controls.  
- **Test:** malicious JSON fields stripped.

### SEC-05 — npm audit high (source-map-js)

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** lockfile transitive via tooling  
- **Impact:** Dev/build DoS advisory; not shipped as app runtime secret.  
- **Proposed fix:** `npm audit fix` / upgrade Vite chain.  
- **Test:** re-run `npm audit`.

### ERR-01 — No error boundary

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `main.jsx` — searched `ErrorBoundary`/`componentDidCatch`: **absent**  
- **Impact:** One throw blanks the whole app.  
- **Proposed fix:** Top-level boundary with reload CTA.  
- **Test:** render child that throws.

### PRIV-01 — Geolocation not rounded

- **Severity:** Medium · **Confidence:** CONFIRMED  
- **Location:** `weather.js:97–107`, `63–70`  
- **What is wrong:** Full lat/lon sent to Open-Meteo; cached in module memory only; not stored in Supabase.  
- **Proposed fix:** Round to ~0.1° before request.  
- **Test:** URL params rounded.

### LOOP-02 — Duplicate mid-layer sentence (neutral-only)

- **Severity:** Low · **Confidence:** CONFIRMED  
- **Location:** `outfitGenerator.js:372–376` — `appendix` already includes `midLayerAppendix`, neutral-only branch appends it again.  
- **Fix:** Use `appendix` only or omit second call.

### DATA-06 — Multi-category items listed twice in grid

- **Severity:** Low · **Confidence:** CONFIRMED  
- **Location:** `WardrobeTab.jsx:297–300` groups by `itemHasCategory`  
- **Impact:** Card appears under both e. andg. top and mid-layer (by design of grouping). Document or show once under `primaryCategory`.

### DATA-07 — Storage remove errors ignored

- **Severity:** Low · **Confidence:** LIKELY  
- **Location:** `persistence.js:256–258`  
- **Fix:** `throwIfError` on remove when intentional; prefer DATA-01 order.

### PLAT-01 / PLAT-02 / DOC-01 / PERF-01

- Inputs use **17px** (iOS zoom OK). `min-height: 100vh` without `dvh` (iOS chrome gap). Actions use `@v4` tags not SHAs. README Descoped still claims no length/warmth. Bundle warning only.

---

## Contradictions register

| Topic | Docs / spec say | Code does | Recommended resolution |
|-------|-----------------|-----------|------------------------|
| Formality | All pieces one tier (README) | Top defines tier; outerwear ≤ top+1; mid/accessories exact | **Keep code**; rewrite README + UI copy |
| Combo formula | top+bottom+shoes+optional outer+0–2 acc | Also optional **mid-layer** | Update README to match OutfitTab/generator |
| Fit volume stack | top/bottom/outerwear only | Includes **mid-layer** in silhouette | Update README **or** exclude mid from volume stack (product call) |
| Analogous band | “20–60°” | `(20,60]` effectively; 20 = mono | Docs: mono `≤20`, analogous `>20 and ≤60` |
| Complementary | 150–210° | Cap at 180 circular | Docs: 150–180° |
| Sample data | Append (README) — OK | Append + no confirm + wardrobe dupes | Keep append; add confirm/dedupe |
| Confirm email off + signup closed | README step 2 | Auth UI is sign-in only; signup closed messaging | **Consistent** if dashboard matches |
| Length/warmth | Listed under Descoped | Implemented + migrations | Remove from Descoped |
| “Synced across devices” | Header copy | No realtime; last-write-wins on patches | Soften copy (“same account”) |
| deltaE formula | Thresholds assume CIEDE2000 | chroma-js **is** CIEDE2000 | Verified OK |

---

## Verified OK (with evidence)

| Area | Check |
|------|--------|
| **RLS tables** | `palette_colors` / `wardrobe_items`: `USING` + `WITH CHECK` auth.uid; `edge_function_usage`: RLS enabled, **no** client policies → default deny; writes only via security-definer RPC |
| **Storage path** | Upload `${userId}/${item.id}.${ext}`; policies folder `[1] = auth.uid()` |
| **Storage UPDATE** | `WITH CHECK` omitted; PostgreSQL uses `USING` for both — OK |
| **JWT user id** | Edge uses `supabase.auth.getUser()` from Bearer; not body |
| **No service worker / PWA** | Searched `serviceWorker`/`workbox`/`manifest.webmanifest`: absent → no SW cache loops / offline closet leak via SW |
| **Blob URL hygiene** | create/revoke paired in export, imageUtils, Wardrobe draft, Bulk unmount, App unmount/sign-out |
| **Theme listener** | `useTheme` removes `matchMedia` listener on cleanup |
| **Menu listeners** | Removed when `menuOpen` false / unmount |
| **Bulk concurrency** | `createConcurrencyLimiter` releases in `finally`; tests cover peak≤2; quota flag stops later suggests (race: two 429s both set flag — benign) |
| **Generator accessory fallback** | Finite: 2→1 then hard truncate; **no** infinite loop |
| **Score ≤0** | Negative scores allowed; selection uses numeric `>`; no falsy “invalid” trap found |
| **last_worn dates** | Written/read via `localDateISO` / `parseLocalDate` (local Y-M-D) — avoids UTC `Date('YYYY-MM-DD')` off-by-one |
| **Updates** | `updateWardrobeItemRow` sends **patch fields only** (good for multi-device) |
| **XSS sinks** | No `dangerouslySetInnerHTML` / `innerHTML` / `document.write` in `src/` |
| **Secrets in dist/git** | No `sk-ant` / `service_role`; Anthropic only Edge env; GH Actions only `VITE_*` |
| **Sign-out** | Clears palette/wardrobe/reference; revokes blob URLs; `signOut()`; theme preference intentionally kept |
| **Auth gate** | Closet UI after `authReady` && `user`; no closet before session |
| **Category equality leftovers** | No remaining `category === 'top'` wardrobe logic; uses `itemHasCategory` / `normalizeCategories` |
| **insert failure cleanup** | Row insert fail → storage remove of new path |
| **StrictMode + rate limit** | Suggest triggered by file handlers, not mount effects that auto-invoke Edge |
| **GitHub Pages base** | `vite.config.js` sets `base` from `GITHUB_REPOSITORY` |
| **Schema vs migrations** | Fresh `schema.sql` already has text[] category, warmth, length, last_worn, palette unique index, usage table — matches layered end state |
| **`available` flag** | Not implemented (searched); N/A |
| **Client enum validation** | `suggestTags.js` whitelists category/formality/fit/warmth/length/seasons |

---

## Proposed fix plan (batches)

### Batch 1 — Security and data-loss *(approve first)*

1. **DATA-01 / DATA-07** — Delete row before storage (or transactional equivalent); check storage errors.  
2. **SEC-01** — Max body / base64 length on Edge Function.  
3. **SEC-02** — CORS allowlist.  
4. **SEC-03** — Don’t burn quota on Claude failure; strip `detail`.  
5. **SEC-04** — Server-side schema whitelist + label cap.  
6. **DATA-02 / DATA-05** — Sample confirm + busy guards / dedupe.  

*Deps:* SEC-02 can ship with SEC-01 in one function redeploy.

### Batch 2 — Core-logic correctness

1. **LOGIC-01** — Neutral vs palette collision.  
2. **LOGIC-02 / 03 / 04 / 07 / DOC-01** — Decide product rules; align README + code.  
3. **LOGIC-05 / 06** — Achromatic scheme + transitive distinct colors.  
4. **LOOP-02** — Duplicate explanation string.

### Batch 3 — Robustness / errors

1. **LOOP-01** — Async/worker enumeration + accessories→0 before truncate.  
2. **DATA-03 / DATA-04** — Hydrating gate; signed-URL refresh.  
3. **ERR-01** — Error boundary.  
4. Empty/loading copy polish if still gaps after hydrating gate.

### Batch 4 — Hardening / cleanup

1. **PRIV-01** — Round geo.  
2. **SEC-05 / PERF-01 / PLAT-02** — audit fix, optional code-split, pin Actions SHAs.  
3. **DATA-06** — Grid once vs twice (product).  
4. Lint unused import.

---

## Decisions needed from the owner

1. **Formality:** Keep outerwear +1 tier (code) or exact match (old README)? **Recommend: keep code.**  
2. **Fit volume stack:** Should mid-layer count as “relaxed volume”? **Recommend: yes (keep code); fix docs.**  
3. **Sample data in production?** **Recommend: hide behind DEV or confirm + wardrobe dedupe.**  
4. **Neutral auto-tag:** Exclude anything near palette, or shrink NEUTRALS list? **Recommend: exclude near-palette.**  
5. **Generator under load:** Worker + sampling vs just lower cap? **Recommend: accessories→0 then worker/chunk.**  
6. **Dual-category grid:** Show twice or once under primary? **Recommend: once under primary, chips for extra roles.**

---

## Test gaps (top 10 by blast × likelihood)

| Rank | Untested / thin behavior |
|-----:|--------------------------|
| 1 | Neutral auto-flag vs DEFAULT_PALETTE (LOGIC-01) |
| 2 | Delete ordering / storage failure (DATA-01) |
| 3 | Edge body size + CORS + quota-on-failure |
| 4 | Main-thread generate timing / accessories→0 |
| 5 | Hydrating vs Generate empty false negative |
| 6 | Achromatic non-neutral scheme drop |
| 7 | Non-transitive ΔE distinct-count |
| 8 | Double-submit Add / sample |
| 9 | Signed URL expiry / img onError refresh |
| 10 | Prompt-injection label length / server parse |

Existing tests (39) cover generator formality/layering/weather/recency, bulk limiter/quota, palette hex dedupe, theme — they assert **intended** behaviors for those units, not full app integration. They do **not** lock README formality text (which disagrees with tests/code).

---

## Stop condition

**Report path:** `outfit-matcher/docs/audit/AUDIT_REPORT.md`

**Batch 1 to fix first (after your explicit approval):** DATA-01 (photo delete order), SEC-01 (image size), SEC-02 (CORS), SEC-03 (quota/errors), then DATA-02 (sample guardrails).

No source fixes have been applied. Waiting for batch approval before changing code. Prompt 2 (manual test plan) should run **after** approved Batch fixes so scenarios match fixed behavior.
