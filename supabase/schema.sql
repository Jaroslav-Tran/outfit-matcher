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
  last_worn date,
  created_at timestamptz not null default now()
);

alter table public.wardrobe_items
  add column if not exists last_worn date;

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
drop policy if exists "wardrobe_select_own" on storage.objects;
create policy "wardrobe_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_insert" on storage.objects;
drop policy if exists "wardrobe_insert_own" on storage.objects;
create policy "wardrobe_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_update" on storage.objects;
drop policy if exists "wardrobe_update_own" on storage.objects;
create policy "wardrobe_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wardrobe_storage_delete" on storage.objects;
drop policy if exists "wardrobe_delete_own" on storage.objects;
create policy "wardrobe_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.edge_function_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  function_name text not null,
  usage_date date not null,
  call_count int not null default 1,
  primary key (user_id, function_name, usage_date)
);

alter table public.edge_function_usage enable row level security;

create or replace function public.increment_edge_function_usage(fn_name text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.edge_function_usage (user_id, function_name, usage_date, call_count)
  values (uid, fn_name, (timezone('utc', now()))::date, 1)
  on conflict (user_id, function_name, usage_date)
  do update set call_count = public.edge_function_usage.call_count + 1
  returning call_count into new_count;
  return new_count;
end;
$$;

revoke all on function public.increment_edge_function_usage(text) from public;
grant execute on function public.increment_edge_function_usage(text) to authenticated;
