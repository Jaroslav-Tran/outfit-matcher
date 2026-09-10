# Outfit Matcher

Single-user React + Vite app. The UI is static on GitHub Pages. Palette, wardrobe, and photos live in **Supabase** so the same closet works on laptop and phone.

## Core features (v1)

**Manual palette entry.** Colors are added with a color picker and a synced hex field, plus an optional label. A color-test report screenshot can be uploaded as an on-screen reference only; it is not parsed and no colors are extracted from it.

**Wardrobe item entry.** Each item is a photo (resized on upload so the long edge is about 500px), a color, a category, a formality tag, a fit tag (`fitted` / `regular` / `relaxed`; shoes use sleek/low-profile, standard, chunky/platform labels), season checkboxes, and an optional label. Hex and Neutral are suggested from the photo pixels in the browser. Category, formality, seasons, fit, and label can be suggested by Claude via a Supabase Edge Function if it is deployed. Every field stays editable. `isNeutral` is auto-suggested by comparing the hex to a hardcoded neutral list with `chroma.deltaE < 12`.

**Outfit generation algorithm.** Combinations are 1 top + 1 bottom + 1 shoes, optional outerwear, and 0–2 accessories (capped at 50,000 enumerated combos). Survivors must share one formality tier (including accessories), pass the season filter if one is set, and have at most two distinct non-neutral colors. Remaining combos are classified as Neutral-only, Monochromatic, Analogous, or Complementary from circular hue distance; unclassified hue pairings are dropped. Scoring uses palette closeness, a single-accessory bonus, a saturation-clash penalty, and fit/proportion balance for top/bottom/outerwear (shoe fit is stored and shown but not scored). Missing `fit` defaults to `regular`. The UI shows the single best-scoring outfit per detected scheme (up to 4), each with a scheme-specific explanation.

**UI state.** `palette` and `wardrobe` are `useState` in `App.jsx`. Tabs are presentational. React state is the UI source of truth; Supabase is the durable store. Signed storage URLs replace `blob:` URLs after upload.

## Architecture (GitHub Pages + Supabase)

```
Phone / laptop browser
        │
        ▼
GitHub Pages  (static React app — no Node server)
        │
        ├─ outfitGenerator.js     runs in the browser
        ├─ imageUtils.js          resize photo to ~500px JPEG
        ├─ colorUtils.js          hex + isNeutral from pixels (client)
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

1. **Run the schema.** SQL Editor → New query → paste `supabase/schema.sql` → Run. This creates `palette_colors`, `wardrobe_items`, RLS policies, and the private `wardrobe` storage bucket.
2. **Auth: Email** enabled. For a personal app, turn off **Confirm email** (Authentication → Providers → Email) so sign-up works without a mailbox loop.
3. **Add site URLs** under Authentication → URL Configuration:
   - `http://127.0.0.1:5173`
   - `http://localhost:5173`
   - `https://jaroslav-tran.github.io/outfit-matcher`
4. **Optional Claude tags.** Dashboard → Edge Functions → secrets → `ANTHROPIC_API_KEY`. Then deploy `supabase/functions/suggest-garment`. The Anthropic key must never go in git, `.env.local`, or GitHub Actions. Hex suggestion still works without this function.

Local env (`.env.local`, gitignored — already created):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

GitHub Pages needs the same two values as repository **Actions secrets** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never add `ANTHROPIC_API_KEY` there. The publishable/anon key is meant for the browser; never commit the service role / `sb_secret_` key.

## Descoped for later

- Automatic color extraction from the color-analysis **report screenshot**
- Weather and occasion-based filtering (season is already a wardrobe tag + generate filter)
- Image cropping/editing on upload
- Multi-user product / accounts beyond a single login
- Garment-area-aware color dominance (v1 approximates this with a saturation-clash penalty only)
- Triadic or tetradic schemes (need 3+ non-neutral colors, which conflicts with the 2-non-neutral cap)
- Explicit style-preference filter (v1 shows one best example per detected scheme instead)
- Fit scoring for shoes (guidance is split on shoe-to-bottom pairing; shoe fit is displayed only)
- Hemline, length, or garment-weight modeling (fit is the 3-tier silhouette only)
- Self-hosted API (Express, Railway, etc.) — not required while Supabase is the backend

## Run locally

```bash
npm install
npm run dev
```

Sign in with the same email on laptop and phone after the schema has been run.

## GitHub Pages

Pushing to `main` builds the app and deploys it with GitHub Actions. Local `npm run dev` still serves at `/`. The production `base` path is set from `GITHUB_REPOSITORY` during the Actions build.

Site: https://jaroslav-tran.github.io/outfit-matcher/  
Repo: https://github.com/Jaroslav-Tran/outfit-matcher
