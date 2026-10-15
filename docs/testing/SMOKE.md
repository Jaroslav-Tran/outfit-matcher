# Smoke suite

Run after a deploy, in the signed-in app. Tick pass / fail / skip. Full click-paths for the *matching* scenario live in `TEST_PLAN.md`.

**Recorded 14 Oct 2026:** checks **1–19** (through **ISO-03**) are tested.

**Recorded 15 Oct 2026:** checks **20–24** (GEN-25, UI-07, WARD-14, BULK-07, BULK-08 reload).

**Still open:** **25–30**.

A few IDs here do **not** match the same ID in `TEST_PLAN.md`. Follow this file:

| Smoke row | Means this | Test plan section with the same steps |
|-----------|------------|----------------------------------------|
| ISO-10 | No API keys in the built app | ISO-08 |
| WARD-08 | Delete removes the photo file | WARD-06 |
| GEN-40 | 150° pair → Complementary card | GEN-37 |
| GEN-55 | Mark as worn lowers the score | GEN-64 |
| GEN-25 | Formal filter + only casual clothes → empty | GEN-41 |
| BULK-01 | Upload 3, save 1 | BULK-03 (save one). The 20-photo cap is test-plan BULK-01 |

Do this on your real closet only for checks that add or read data. Skip any step that would delete shoes or load `seed-closet.json`.

**Pass:** 1–24 are already recorded. 25–30 pass, or a skip has a written reason.

---

### 1. AUTH-01 — Sign in

1. **What to test.** Sign out, then sign in with your email and password.
2. **Expected.** The account menu shows your email. My Palette, My Wardrobe, and Generate are visible. The form has no Create account link.
3. **Edge.** A wrong password stays on Sign in (that is AUTH-03). Closet photos must not flash before “Checking sign-in…” finishes.

### 2. AUTH-02 — Sign out clears the closet

1. **What to test.** With at least one wardrobe photo on screen, Account → Sign out.
2. **Expected.** Only the Sign in screen remains. No photos, palette swatches, or outfit cards.
3. **Edge.** Reload while signed out. The closet must stay hidden, including if the network is off.

### 3. AUTH-04 — Reload keeps the session

1. **What to test.** While signed in, reload the page.
2. **Expected.** A short “Checking sign-in…”, then the same account and wardrobe. No password prompt.
3. **Edge.** An expired session returns you to Sign in. It must not show an empty closet as if you owned nothing.

### 4. ISO-10 — No Anthropic or service-role key in the built app

1. **What to test.** From `outfit-matcher`, run `npm run build`. Search the `dist` folder for `sk-ant`, `service_role`, and `ANTHROPIC`.
2. **Expected.** None of those strings appear. The public Supabase anon key may appear.
3. **Edge.** Repeat the search on the live GitHub Pages JavaScript, not only the local build.

### 5. PAL-02 — Add a palette hex, reject a bad one

1. **What to test.** My Palette. Add `#D5BBA7`, then the same color as `d5bba7` and `#d5bba7`. Then try `#GGG`, `123`, an empty field, and `#D5BBA7FF`.
2. **Expected.** Valid forms become one row. Invalid forms show an error and add nothing.
3. **Edge.** `#ABC` is valid and expands to `#AABBCC`. Adding Warm Sand a second time must not create a second row.

### 6. WARD-01 — Add a photo; it survives reload

1. **What to test.** Add a clothing photo (JPEG or HEIC), set tags, click Add item, then reload.
2. **Expected.** The item is still there with the same hex, label, and tags. The stored file is a resized JPEG, about 500px on the long edge.
3. **Edge.** A HEIC that fails to convert shows an error and does not save a broken row. A double-click on Add item creates one row, not two.

### 7. WARD-08 — Delete removes the Storage file

1. **What to test.** Add a throwaway photo, delete that item, reload, then look in Supabase Storage → bucket `wardrobe`.
2. **Expected.** The card is gone. The file for that item is gone from the bucket.
3. **Edge.** If the file delete fails, the wardrobe row still stays deleted. It must not come back pointing at a missing photo. Delete the throwaway item, not a piece you want to keep.

### 8. GEN-01 — No shoes → empty notice

1. **What to test.** Generate with formality Any and season Any, when the closet has a top and a bottom and no shoes that pass those filters.
2. **Expected.** No outfit cards. The notice names the empty slot: “Not enough matching pieces yet — add shoes.” A summer filter that excludes every shoe says “add shoes for summer.”
3. **Edge.** Missing tops or bottoms are named the same way (“add a top”, “add a bottom”). When a top, bottom, and shoes all exist but color rules reject every combination, the notice stays generic: “add more items or relax the formality or season filter”. On your real closet, skip this rather than deleting shoes.

### 9. GEN-10 — A casual set produces a card

1. **What to test.** One casual top, one casual bottom, one casual pair of shoes. Formality Any, season Any, weather off. Generate.
2. **Expected.** At least one scheme card (Neutral-only or Monochromatic is enough).
3. **Edge.** A smart-casual top with only casual bottom and shoes produces the empty notice. The three core pieces have to share the top’s formality.

### 10. GEN-40 — Opposite hues → Complementary

1. **What to test.** Two non-neutral pieces about 150° apart on the color wheel (blue and orange, or red and green), plus neutral shoes (black, white, or grey). Generate.
2. **Expected.** A card titled Complementary contrast.
3. **Edge.** A pair around 149° is a dead zone and must not be labeled Complementary. Neutrals do not count toward the hue. Exact 150° is the seed-closet case; a clearly opposite pair is enough for this smoke check.

### 11. GEN-55 — Mark as worn lowers the score

1. **What to test.** Generate, note the score on the top card, click Mark as worn, then Generate again.
2. **Expected.** A “Marked as worn today” notice. Each piece you just marked scores 5 points lower. The card can drop in rank. It can still appear if it is the only complete outfit.
3. **Edge.** Mark as worn does not delete the item. Worn 3–5 days ago is −2. Older than 5 days is 0.

### 12. GEN-60 — Manual Mild weather, then location

1. **What to test.** On Generate, set weather to Mild by hand and click Generate. In DevTools → Network, filter for `open-meteo`. Then click Use my location.
2. **Expected.** Manual Mild generates with no Open-Meteo request. Use my location makes one request to `api.open-meteo.com` and shows a temperature band.
3. **Edge.** If you deny location, an error appears and Generate still works. After one successful location fetch, five more Generate clicks inside 30 minutes must not call Open-Meteo again.

### 13. PERF-02 — Rapid Generate does not stack

1. **What to test.** Click Generate 5 times quickly.
2. **Expected.** One result list, from the last click. Earlier clicks do not leave a second copy of the cards underneath.
3. **Edge.** After the spinner stops, one more Generate with the same filters returns the same cards and scores.

### 14. BULK-01 — Three photos, save one

1. **What to test.** My Wardrobe → bulk upload. Pick 3 photos. When they are ready, save only one.
2. **Expected.** That one item is in the wardrobe after reload. The other two stay in the review list and are not in the closet. Each review row shows a photo, color, hex, label, category, and formality. Open a row to edit the rest.
3. **Edge.** Picking 25 photos queues 20. A large red note under Choose files, and a popup, both say “20 photos queued. 5 not included because of the limit.” **Remove** drops that photo from the review list and does not add it to the wardrobe.

### 15. EXP-01 — Export is your closet only

1. **What to test.** Account → Export. Choose properties and any category, formality, season, or warmth filters, then export. Open the JSON file.
2. **Expected.** `schema_version` is `1`. The file contains only the properties you checked, and only clothes that match the filters. An empty filter includes every item. Rows you kept can include warmth, length, last_worn, and image_path.
3. **Edge.** The file has no `imageUrl` and no access token. Signed out, Export is not available.

### 16. UI-01 — Theme survives reload

1. **What to test.** Click the theme control through system → light → dark, and reload on each stop.
2. **Expected.** The page matches the choice you picked. Reload keeps that choice. On system, changing the Mac appearance updates the app.
3. **Edge.** If the browser blocks localStorage, the app still loads and uses the system theme.

### 17. UI-03 — Generate works at 390px wide

1. **What to test.** DevTools → set the width to 390px. Open Generate, change a filter, click Generate.
2. **Expected.** Filters, Generate, and the result cards are usable. You are not stuck in sideways scrolling to reach the button.
3. **Edge.** At 1280px the same screen still fits. On a phone, tapping a text field must not zoom the page.

### 18. AUTH-03 — Wrong password

1. **What to test.** Sign out. Enter the correct email and a wrong password. Sign in.
2. **Expected.** An inline error with the Supabase message. You remain on Sign in.
3. **Edge.** An empty email or empty password also stays on the form and does not open the closet.

### 19. ISO-03 — Edge Function without a login

1. **What to test.** In Terminal:

```bash
curl -si -X POST "https://pfzdquqmwcluswlkqnct.supabase.co/functions/v1/suggest-garment" \
  -H "Content-Type: application/json" \
  -d '{}'
```

2. **Expected.** HTTP 401 and a sign-in error. No clothing tags.
3. **Edge.** Sending the anon key, or the text `not-a-jwt`, as the Bearer token is also 401. A real signed-in call may return 200. The body must not contain the Anthropic key.

### 20. GEN-25 — Formal filter with only casual clothes

**Tested 15 Oct 2026.**

1. **What to test.** With a closet that can build a casual outfit and has no formal top + bottom + shoes, set formality to Formal and Generate.
2. **Expected.** “No formal tops, bottoms, or shoes match this filter.” No outfit card built from casual pieces. If only shoes are casual, the notice names shoes alone.
3. **Edge.** Switch formality back to Any and the casual outfit returns. If you later add a full formal set, Formal shows only that set.

---

## Follow-ups

Checks **20–24** were tested on 15 Oct 2026. Checks **25–30** are still open.

### 21. UI-07 — Reload stays on the last tab

**Tested 15 Oct 2026.**

1. **What to test.** Open **My Wardrobe**, then reload the page.
2. **Expected.** You come back on **My Wardrobe**, with the same account. The page does not reset to **My Palette**.
3. **Edge.** Open **Generate**, reload, and you come back on **Generate**.

### 22. WARD-14 — Edit an item in a popup

**Tested 15 Oct 2026.**

1. **What to test.** On **My Wardrobe**, click a saved tile.
2. **Expected.** A popup opens over the page. The wardrobe grid stays behind it. You can change label, color, category, formality, fit, warmth, length, seasons, and Neutral, then **Save changes**. After reload, the new values are still on that item.
3. **Edge.** **Mark as worn** sets today. If it is already worn today, that button is hidden and **Clear worn date** remains. Escape or Close dismisses the popup and does not delete the item.

### 23. BULK-07 — Short review row and a photo

**Tested 15 Oct 2026.**

1. **What to test.** Bulk-upload a few photos, including one HEIC. Wait until a row is no longer queued or processing.
2. **Expected.** The row shows a picture, a color swatch, hex, label, category, and formality. The picture is the converted JPEG, not a broken HEIC icon.
3. **Edge.** Click the row. The full editor (fit, warmth, length, seasons, Neutral) opens in a popup. Close it and the review list is still there. While a row still says queued or processing, its picture slot can be blank.

### 24. BULK-08 — Unsaved bulk rows survive reload

**Tested 15 Oct 2026.**

1. **What to test.** Bulk-upload 3 photos. Save one. Leave the other two unsaved. Reload.
2. **Expected.** The saved item is in the wardrobe grid. The two unsaved rows are still in the bulk review list, and they are not duplicated as saved wardrobe items.
3. **Edge.** Reload again. Those two unsaved rows are still there once.

### 25. BULK-09 — More than 20 photos

1. **What to test.** With an empty review list, bulk-upload 25 photos.
2. **Expected.** A large red line under the file field says “20 photos queued. 5 not included because of the limit.” The popup says “The first 20 were added. These were not:” and lists those 5 file names in the order you selected them. There are no thumbnails. The review list has 20 rows.
3. **Edge.** Close the popup. The red line stays. Click the red line and the same names open again. A long name is cut with an ellipsis. **OK** stays on screen while the name list scrolls.

### 26. EXP-04 — Choose what the export includes

1. **What to test.** Account → **Export**. Before the file downloads, uncheck **Image path**, set formality to **casual**, and leave category, season, and warmth empty. Then click **Export** and open the JSON.
2. **Expected.** The download does not start until you click **Export** in the popup. `schema_version` is `1`. Wardrobe rows have no `image_path`. Only casual items are included. Empty filters do not remove items.
3. **Edge.** Close the popup without clicking **Export** and no file downloads. The file has no `imageUrl` and no access token. Uncheck **Include palette colors** and `palette` is an empty list.

### 27. WARD-15 — Save changes confirms in yellow, then green

1. **What to test.** Open a wardrobe item, change one tag, and click **Save changes**.
2. **Expected.** The button turns yellow and reads **Saving…**, then turns green and reads **Saved**. After about 2 seconds it returns to **Save changes**. The popup stays open. The tile behind the popup shows the new tag.
3. **Edge.** Change a field while the button says **Saved** and it returns to **Save changes** immediately. If the save fails, the button stays the original color and a red error appears under it.

### 28. BULK-10 — Even gaps and names under the review row

1. **What to test.** Bulk-upload a few photos and wait until a row is ready.
2. **Expected.** The gap is the same between the picture, color swatch, hex code, item name, category, and formality. Under the list, the labels read Picture, Color swatch, Hex code, Item Name, Category, and Formality.
3. **Edge.** Narrow the window until the hex, category, and formality values hide. Those three labels hide with them.

### 29. BULK-11 — Remove drops a photo from the queue

1. **What to test.** On a ready row, click the red **Remove** button. Repeat from the editor: open a row and click the red **Remove** next to **Save**.
2. **Expected.** That photo leaves the review list and does not appear in the wardrobe. Reload. It is still gone.
3. **Edge.** A row that is already saved has no **Remove** button. The wardrobe item stays.

### 30. BULK-12 — A new pick is added to the queue

1. **What to test.** Leave two unsaved photos in the review list. Pick two more.
2. **Expected.** The first two stay. The new photos are added after them. Nothing already in the list is replaced.
3. **Edge.** With 18 unsaved photos, pick 5 more. Two are added. The popup says “2 added. The queue already had 18. These were not:” and lists the 3 file names that were left out. The queue then has 20 unsaved photos.
