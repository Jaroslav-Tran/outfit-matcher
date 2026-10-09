# Owner actions (Batch 1)

Do these in the Supabase dashboard / CLI. The agent does **not** deploy or run SQL against the live project.

## 1. Deploy Edge Function and set secrets

From the `outfit-matcher/` directory (with the Supabase CLI logged in to project `pfzdquqmwcluswlkqnct`):

```bash
supabase secrets set ALLOWED_ORIGINS="https://jaroslav-tran.github.io,http://localhost:5173,http://127.0.0.1:5173"
supabase secrets set SUGGEST_GARMENT_MAX_IMAGE_BYTES="768000"
# Keep existing secrets; only set if missing:
# supabase secrets set ANTHROPIC_API_KEY="…"
# supabase secrets set SUGGEST_GARMENT_DAILY_CAP="50"

supabase functions deploy suggest-garment --project-ref pfzdquqmwcluswlkqnct
```

Confirm secrets under **Project Settings → Edge Functions → Secrets**:
- `ANTHROPIC_API_KEY` (present; never in GitHub Actions or `.env.local`)
- `SUGGEST_GARMENT_DAILY_CAP` (e.g. `50`)
- `ALLOWED_ORIGINS`
- `SUGGEST_GARMENT_MAX_IMAGE_BYTES`

## 2. Migrations to run (SQL Editor, in order)

Paste and run each file’s contents (or the whole file) in **SQL Editor → New query → Run**:

1. If not already applied historically: `supabase/hardening.sql` (storage folder policies + usage table + increment RPC). Skip if already run.
2. Layering / palette / last_worn migrations if this project is older than those features (only if not yet applied):
   - `supabase/migration_last_worn.sql`
   - `supabase/migration_layering.sql`
   - `supabase/migration_palette_hex_unique.sql`
3. **Required for Batch 1:** `supabase/migrations/20261009153000_refund_edge_function_usage.sql`

## 3. Storage bucket MIME types (remove SVG)

**SQL Editor → New query → Run:**

```sql
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'wardrobe';
```

Verify: **Storage → wardrobe → Configuration** (or re-select the row) shows only jpeg/png/webp. Bucket remains **private** (`public = false`).

## 4. Dashboard checks the static audit could not verify

| Check | Where | Expected |
|-------|--------|----------|
| Sign-ups disabled | **Authentication → Providers → Email** (or **Sign In / Providers**) | **Allow new users to sign up** = **OFF** |
| Confirm email | Same Email provider settings | **Confirm email** = **OFF** (so the existing account can sign in without a confirm loop; sign-up stays closed via the toggle above) |
| Redirect URLs | **Authentication → URL Configuration → Redirect URLs** | Exactly (or at least) `http://127.0.0.1:5173`, `http://localhost:5173`, `https://jaroslav-tran.github.io/outfit-matcher` — **no stray hosts** |
| Site URL | **Authentication → URL Configuration** | Production site or localhost for dev; consistent with Pages |
| Verify JWT | **Edge Functions → suggest-garment → Details** (or function config) | **Verify JWT** = **enabled** |
| Anthropic key location | **Project Settings → Edge Functions → Secrets** only | `ANTHROPIC_API_KEY` **not** in GitHub Actions secrets, not in repo, not in `.env.local` |
| Bucket private | **Storage → wardrobe** | **Public** = false |
| RLS on tables | **Database → Tables** (or Authentication policies) | RLS **enabled** on `palette_colors`, `wardrobe_items`, and `edge_function_usage`. `edge_function_usage` should have **no** client policies (deny-by-default; writes only via RPCs). |

## 5. Manual checks after deploy (no unit test)

- Call `suggest-garment` from the app with a normal photo → tags return.
- Oversized body / wrong MIME → 413 / 415 (browser Network tab).
- From a random origin (or curl without matching Origin) browser CORS should block; cost controls still apply with a stolen JWT regardless of CORS.
- Force Anthropic failure (bad key temporarily) → client sees `{ "error": "upstream_failed" }` with **no** Anthropic body; usage count does not permanently increase (refund).
