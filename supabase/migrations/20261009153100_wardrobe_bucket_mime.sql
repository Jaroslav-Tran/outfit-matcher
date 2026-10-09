-- Remove SVG from wardrobe bucket allowed MIME types (client uploads JPEG).
-- Idempotent. Also listed in docs/audit/OWNER_ACTIONS.md for the SQL Editor.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'wardrobe';
