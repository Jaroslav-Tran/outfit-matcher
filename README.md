# Outfit Matcher

Single-user, local-only React + Vite app. Palette and wardrobe live in React state for the current browser session. Refreshing the page clears everything.

## Core features (v1)

**Manual palette entry.** Colors are added with a color picker and a synced hex field, plus an optional label. A color-test report screenshot can be uploaded as an on-screen reference only; it is not parsed and no colors are extracted from it.

**Wardrobe item entry.** Each item is a photo (resized on upload so the long edge is about 500px), a manually chosen color, a category, a formality tag, a fit tag (`fitted` / `regular` / `relaxed`; shoes use sleek/low-profile, standard, chunky/platform labels), season checkboxes, and an optional label. Formality, fit, and season are user tags — they are not inferred from the photo or hex. `isNeutral` is auto-suggested by comparing the hex to a hardcoded neutral list with `chroma.deltaE < 12`, then left as an editable checkbox.

**Outfit generation algorithm.** Combinations are 1 top + 1 bottom + 1 shoes, optional outerwear, and 0–2 accessories (capped at 50,000 enumerated combos). Survivors must share one formality tier (including accessories), pass the season filter if one is set, and have at most two distinct non-neutral colors. Remaining combos are classified as Neutral-only, Monochromatic, Analogous, or Complementary from circular hue distance; unclassified hue pairings are dropped. Scoring uses palette closeness, a single-accessory bonus, a saturation-clash penalty, and fit/proportion balance for top/bottom/outerwear (shoe fit is stored and shown but not scored). Missing `fit` defaults to `regular`. The UI shows the single best-scoring outfit per detected scheme (up to 4), each with a scheme-specific explanation.

**Session-only state.** There is no backend, database, auth, or persistence. `palette` and `wardrobe` are `useState` in `App.jsx`. Object URLs from uploads are revoked on item delete and on unmount.

## Descoped for later

- Automatic color extraction from report screenshots or clothing photos (currently manual entry only)
- Persistence / saved wardrobe across sessions
- Weather and occasion-based filtering (season is already a wardrobe tag + generate filter)
- Image cropping/editing on upload
- Multi-user support or accounts
- Garment-area-aware color dominance (v1 approximates this with a saturation-clash penalty only)
- Triadic or tetradic schemes (need 3+ non-neutral colors, which conflicts with the 2-non-neutral cap)
- Explicit style-preference filter (v1 shows one best example per detected scheme instead)
- Fit scoring for shoes (guidance is split on shoe-to-bottom pairing; shoe fit is displayed only)
- Hemline, length, or garment-weight modeling (fit is the 3-tier silhouette only)

## Run locally

```bash
npm install
npm run dev
```

## GitHub Pages

Pushing to `main` builds the app and deploys it with GitHub Actions. Local `npm run dev` still serves at `/`. The production `base` path is set from `GITHUB_REPOSITORY` during the Actions build.
