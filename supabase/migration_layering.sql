-- Layering: multi-select category, warmth, length.
-- Run once in Supabase SQL Editor after backup if needed.

alter table public.wardrobe_items
  add column if not exists warmth text check (warmth in ('light', 'medium', 'heavy'));

alter table public.wardrobe_items
  add column if not exists length text check (length in ('cropped', 'regular', 'long'));

alter table public.wardrobe_items
  alter column category type text[] using array[category];

alter table public.wardrobe_items
  alter column category set default array['top']::text[];

alter table public.wardrobe_items
  alter column category set not null;
