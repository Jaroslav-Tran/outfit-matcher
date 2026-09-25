-- Incremental hardening for an already-created project.
-- SQL Editor → New query → paste → Run.
-- Then redeploy suggest-garment and set secret SUGGEST_GARMENT_DAILY_CAP=50.

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