-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Uses the postgres role, so it works even with automatic RLS on.

create table if not exists public.palette_colors (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  hex text not null,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.wardrobe_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  hex text not null,
  category text not null,
  formality text not null,
  fit text not null default 'regular',
  seasons text[] not null default '{}',
  is_neutral boolean not null default false,
  label text,
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists palette_colors_user_id_idx on public.palette_colors (user_id);
create index if not exists wardrobe_items_user_id_idx on public.wardrobe_items (user_id);

alter table public.palette_colors enable row level security;
alter table public.wardrobe_items enable row level security;

drop policy if exists "palette_own_all" on public.palette_colors;
create policy "palette_own_all"
  on public.palette_colors
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "wardrobe_own_all" on public.wardrobe_items;
create policy "wardrobe_own_all"
  on public.wardrobe_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe',
  'wardrobe',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "wardrobe_storage_select" on storage.objects;
create policy "wardrobe_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_insert" on storage.objects;
create policy "wardrobe_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_update" on storage.objects;
create policy "wardrobe_storage_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_delete" on storage.objects;
create policy "wardrobe_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
