-- Normalize hex casing, remove duplicate hexes per user, then enforce uniqueness.

update public.palette_colors
set hex = lower(hex)
where hex is not null
  and hex <> lower(hex);

delete from public.palette_colors a
using public.palette_colors b
where a.user_id = b.user_id
  and lower(a.hex) = lower(b.hex)
  and (
    a.created_at > b.created_at
    or (a.created_at = b.created_at and a.id::text > b.id::text)
  );

create unique index if not exists palette_colors_user_hex_uidx
  on public.palette_colors (user_id, lower(hex));
