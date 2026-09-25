# Outfit Matcher

Single-user React + Vite app. The UI is static on GitHub Pages. Palette, wardrobe, and photos live in **Supabase** so the same closet works on laptop and phone.

## Core features

### Personal color palette

Your seasonal / personal color analysis is the reference set outfits are scored against.

- **Extract from a report screenshot.** On **My Palette**, upload the color-analysis image. The app samples pixels in the browser (no Claude, no OCR), drops paper-white and near-black text, clusters similar colors (`chroma.deltaE < 12`), and offers up to 16 swatches. Deselect hair, skin, or UI chrome, then **Add selected** or **Add all new**. Near-duplicates of colors you already saved are skipped.
- **Add by hand.** Color picker + hex + optional label, same as before.
- **What is stored.** Each palette row is `id`, `hex`, and optional `label`. The analysis screenshot is also saved (resized to ~1000px JPEG) in Storage at `{userId}/palette-reference.jpg` and reloads when you sign in.
- **How outfits use it.** Every wardrobe item is compared to the palette. Score contribution is `max(0, 20 − ΔE)` per non-neutral piece. Explanations mention the closest palette name when one exists.

### Wardrobe items

Each piece is a photo plus tags. React state is the UI source of truth; Supabase is the durable store.

- **Photo.** Resized to ~500px on the long edge (JPEG) and stored in the private `wardrobe` bucket. Signed URLs are created at load time. `blob:` URLs are not persisted.
- **Color from the photo.** Dominant colors are clustered from the center of the image (margins skipped so a bedsheet background is less likely to win). Up to four distinct colors are shown. **One hero hex is saved** — that is the color outfits see.
- **Snap to your analysis.** If a palette exists and the closest analysis color is within **ΔE 18** of the dominant photo color, that palette hex is auto-selected. You can tap any extracted photo swatch or any palette swatch instead.
- **Neutral.** Suggested when the hero hex is within ΔE 12 of a hardcoded neutral list (black, white, greys, navy, beige, tan, brown, olive, charcoal). The checkbox stays editable.
- **Tags.** Category, formality, fit, seasons, and label can be filled by Claude vision (`suggest-garment` Edge Function) when it is deployed. Hex is never asked of Claude. Every field is editable before save.
- **Fit labels.** `fitted` / `regular` / `relaxed`. Shoes display as sleek/low-profile, standard, chunky/platform. Missing fit defaults to `regular`.

### Multi-colored clothes

A shirt with navy stripes on white is **one wardrobe row with one hex**. The generator does not see the other colors on the fabric.

- On upload, extra extracted swatches are shown so you can pick which color is the hero (the navy stripe vs the white ground).
- Outfit math then treats the piece as that single color: the 3-color rule, scheme classification (mono / analogous / complementary), palette ΔE, and the saturation-clash penalty all use only that hex plus the `isNeutral` flag.
- If you mark the item **Neutral**, its hero hex does not count toward the two-non-neutral cap, even if the photo also had a bright print color you did not store.
- There is no second hex, print mask, or “garment area” model. A busy print that you want to count as two colors would have to be represented by two items, or you accept that only the hero color participates.

### Outfit generation

Combinations are **1 top + 1 bottom + 1 shoes**, optional outerwear, and **0–2 accessories**, capped at 50,000 enumerated combos (2-accessory subsets are dropped first if the raw count is too high).

Survivors must:

1. Share **one formality tier** on every piece, including accessories. The Generate tab can further restrict that tier.
2. Pass the **season** filter when one is set (an item with no seasons is treated as all seasons).
3. Have **at most two distinct non-neutral colors** (hexes within ΔE 12 count as the same color).
4. Classify as Neutral-only, Monochromatic, Analogous, or Complementary. Other hue pairings are dropped.

**Scheme rules** (circular hue distance of the distinct non-neutral hexes):

| Scheme | Rule |
|---|---|
| Neutral-only | No non-neutral pieces |
| Monochromatic | One non-neutral, or two with hue distance ≤ 20° |
| Analogous | Two non-neutrals, hue distance 20–60° |
| Complementary | Two non-neutrals, hue distance 150–210° |
| Unclassified | Anything else — discarded |

The UI shows the **single best-scoring outfit per scheme** (up to 4), in a fixed scheme order, not a global top-N by score.

**Scoring**

- Palette closeness: `Σ max(0, 20 − ΔE)` over non-neutral items.
- +2 for exactly one accessory.
- −3 per high-saturation non-neutral if two or more are loud (HSL S > 0.6).
- Fit extras below (top / bottom / outerwear only).
- Soft **recency** penalty per item in the combo (top, bottom, shoes, outerwear, accessories): never worn → 0; worn within the last 2 local days → −5; within the last 5 days → −2; otherwise 0. Soft only — recently worn looks still appear, they just rank lower.

### Mark as worn

Each generated outfit card has **Mark as worn**. That sets `last_worn` to today’s **local** calendar date (`YYYY-MM-DD`) on every piece in the look (one Supabase update for those ids). Only the latest wear date is stored — not a full history. Marking the same outfit twice in one day is fine (same date rewritten). On **My Wardrobe**, each item shows last worn and **Clear worn date** if you marked by mistake.

Requires the column migration once: paste `supabase/migration_last_worn.sql` in the SQL Editor.

### Fit scoring (top, bottom, outerwear)

Shoe fit is **not** included here.

- **Balance +3** if one of top/bottom is fitted and the other is relaxed.
- **Volume stack −4** per extra relaxed piece beyond the first, among top, bottom, and outerwear.
- **Layer inversion −4** if fitted outerwear is worn over a relaxed top.
- Missing fit is `regular`. Explanations append a sentence when balance or stacked volume applied.

### Shoes: matching logic

Shoes are **required**. There is no outfit without a shoe item.

A shoe is allowed in a look when **all** of the following hold. There is no extra “this shoe is good with these trousers” model.

1. **Formality.** The shoe’s formality tag equals the outfit tier (the top’s formality). Casual sneakers never enter a formal combo.
2. **Season.** If you filter by season, the shoe must be tagged for that season.
3. **Color budget.** The shoe’s hero hex counts like any other item. A bright non-neutral shoe can be the second color or can push the combo over the two-non-neutral cap and kill it. A shoe marked Neutral does not consume a color slot.
4. **Scheme.** The shoe hue participates in mono / analogous / complementary classification with the other non-neutrals.

**What shoes do not do today**

- Fit is stored and shown (sleek / standard / chunky) but **does not change the score**. A chunky sneaker under slim trousers is not penalized.
- There is no shoe-to-bottom pairing table (e.g. loafers + chinos, boots + heavy wool).
- There is no heel height, last shape, or color-matching rule beyond the shared hex / formality / season / 3-color logic above.

If a shoe “matches,” it means: same formality, in-season, and the outfit still has a legal color scheme after including that shoe’s hero color.

### Persistence and accounts

`palette` and `wardrobe` live in `useState` in `App.jsx`. Tabs stay mounted. Signed-in writes go to Supabase (`palette_colors`, `wardrobe_items`, Storage). Row Level Security limits rows to `auth.uid()`. Sample data replaces the signed-in user’s rows when loaded.

**Export my closet** (signed-in header) downloads JSON `{ schema_version, exported_at, palette, wardrobe }` — tags, colors, and Storage paths only, not photo bytes.

### Security (single-user)

- **Sign-up is closed in the UI.** Enforcement is the dashboard toggle: Authentication → Providers → Email → turn off **Allow new users to sign up**. Sign-in for the existing account is unchanged. To add a second person later, turn that toggle back on in the dashboard (not a code flag), create their account, then turn sign-up off again.
- **Storage paths** are `{auth.uid()}/{itemId}.ext` (and `{auth.uid()}/palette-reference.jpg`). Bucket policies `wardrobe_*_own` allow authenticated users to read/write only their own folder.
- **`suggest-garment` daily cap.** Table `edge_function_usage` plus RPC `increment_edge_function_usage`. Cap is the Edge Function secret `SUGGEST_GARMENT_DAILY_CAP` (default 50 if unset). A 429 shows “Daily AI tagging limit reached — add tags manually for now.”

If the project already existed before these policies, run `supabase/hardening.sql` once, set `SUGGEST_GARMENT_DAILY_CAP`, and redeploy `suggest-garment`.

## Architecture (GitHub Pages + Supabase)

```
Phone / laptop browser
        │
        ▼
GitHub Pages  (static React app — no Node server)
        │
        ├─ outfitGenerator.js     runs in the browser
        ├─ imageUtils.js          resize photo / report screenshot
        ├─ colorUtils.js          extract swatches, hex, isNeutral, snap to palette
        │
        └─ Supabase
              ├─ Auth            email + password
              ├─ Postgres        palette + wardrobe rows (RLS: own rows only)
              ├─ Storage         resized clothing photos
              └─ Edge Function   Claude vision for tag suggestions
                                 (Anthropic key lives here, not in the repo)
```

## One-time Supabase setup

Do this in the [Supabase dashboard](https://supabase.com/dashboard) for project `pfzdquqmwcluswlkqnct`.

1. **Run the schema** (new project) or **`supabase/hardening.sql`** (existing project). SQL Editor → New query → paste → Run. For “Mark as worn,” also run **`supabase/migration_last_worn.sql`** once.
2. **Auth: Email** enabled. Turn off **Confirm email**. Turn off **Allow new users to sign up** so only the existing account can sign in.
3. **Add site URLs** under Authentication → URL Configuration:
   - `http://127.0.0.1:5173`
   - `http://localhost:5173`
   - `https://jaroslav-tran.github.io/outfit-matcher`
4. **Claude tags.** Edge Function secrets: `ANTHROPIC_API_KEY` and `SUGGEST_GARMENT_DAILY_CAP` (e.g. `50`). Deploy `supabase/functions/suggest-garment`. Neither secret goes in git, `.env.local`, or GitHub Actions. Palette extraction and garment hex still work without this function.

Local env (`.env.local`, gitignored):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

GitHub Pages needs the same two values as repository **Actions secrets** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never add `ANTHROPIC_API_KEY` there.

## Descoped for later

- Weather and occasion-based filtering (season is already a wardrobe tag + generate filter)
- Image cropping/editing on upload
- Multi-user product / accounts beyond a single login
- Storing multiple hexes per garment so a print can consume two color slots
- Garment-area-aware color dominance (v1 uses center sampling + a saturation-clash penalty)
- Triadic or tetradic schemes (need 3+ non-neutral colors, which conflicts with the 2-non-neutral cap)
- Explicit style-preference filter (v1 shows one best example per detected scheme instead)
- Shoe-to-bottom pairing and shoe fit in the score (shoe fit is displayed only)
- Full wear-history / analytics (`wear_events` table) — v1 stores only `last_worn` per item
- Hemline, length, or garment-weight modeling (fit is the 3-tier silhouette only)
- Self-hosted API (Express, Railway, etc.) — not required while Supabase is the backend

## Run locally

```bash
npm install
npm run dev
npm run test
```

Sign in with the same email on laptop and phone after the schema has been run.

Before finishing any change to `outfitGenerator.js` or `colorUtils.js`, run `npm run test`.

## GitHub Pages

Pushing to `main` builds the app and deploys it with GitHub Actions. Local `npm run dev` still serves at `/`. The production `base` path is set from `GITHUB_REPOSITORY` during the Actions build.

Site: https://jaroslav-tran.github.io/outfit-matcher/  
Repo: https://github.com/Jaroslav-Tran/outfit-matcher
