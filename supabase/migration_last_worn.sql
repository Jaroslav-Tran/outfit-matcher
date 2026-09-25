-- Incremental: add last_worn for "Mark as worn" cooldown.
-- SQL Editor → New query → paste → Run.

alter table public.wardrobe_items
  add column if not exists last_worn date;
