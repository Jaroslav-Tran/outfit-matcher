# Loading the seed closet

## Important

- Use a **throwaway Supabase user** (or a dedicated test project). Never load the full seed into the real closet.
- The in-app **Add sample data** button loads the hard-coded `createSampleData()` set only — it does **not** read `seed-closet.json`.
- There is **no** `available` flag in the app. Ignore any older README mention of availability.

## Files

| File | Purpose |
|------|---------|
| `seed-closet.json` | 12 palette colors + ~82 wardrobe rows with exact tags and notes |
| `seed-closet-large.json` | 3×3×3×2×2×35 accessory closet; raw combo count with maxAccessories=2 ≈ **153 333** (> `MAX_COMBINATIONS` 50 000) |

## Recommended load method (hand entry)

1. Sign in on the test account.
2. **My Palette** — add each palette color from `seed-closet.json` → `palette` (hex + label). Skip duplicates if the unique hex constraint rejects them.
3. **My Wardrobe** — for each object in `wardrobe`:
   - Upload any photo (solid color PNG matching the hex is ideal).
   - Set **hex**, **categories**, **formality**, **fit**, **warmth**, **length**, **seasons**, **Neutral**, **label** exactly as in the JSON.
   - For `lastWorn`, after save open the item (or Generate → Mark as worn, or SQL) so `last_worn` matches the ISO date in the JSON. Dates in the seed are relative to `last_worn_dates_relative_to`.
4. For `TOP-LEGACY-NULLS`: leave fit/warmth/length at defaults after insert, then in SQL Editor set `fit`/`warmth`/`length` to `NULL` for that row (or skip if you only need UI-default behavior).
5. Multi-category items (`TOP-MID-CARDIGAN`, `OUTER-MID-LIGHT`): select both categories in the multi-select.

## Faster option (DevTools + Storage)

If you prefer automation: generate 1×1 PNGs per hex, then use the signed-in session’s `supabase` client from the app bundle to `storage.upload` + `insert` into `wardrobe_items`. Keep `user_id = auth.uid()`. Exact snippet is optional; hand entry above is the supported path.

## Large closet (`PERF-*`)

1. On a **second** throwaway account, add the 13 `LG-*` core items from `seed-closet-large.json`.
2. Bulk-upload 35 small grey PNGs; tag each **accessory / casual / Neutral / regular**.
3. Or duplicate `ACC-CASUAL` 35 times with distinct labels if bulk is unavailable.
4. Confirm in DevTools console after Generate: a warning starting with `Outfit enumeration:`.

## Scenario subsets

Most `GEN-*` scenarios name seed IDs. You do not need all 82 items for every run — load the IDs listed in **Preconditions** for that scenario (plus shared `SHOES-BLACK` / `BOTTOM-BLACK` when required).
