-- SEC-03: refund reserved AI quota on upstream failure.
-- Also pin search_path and revoke execute from public/anon on usage RPCs.
-- Idempotent. Run in SQL Editor after backup if needed.

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
set search_path = ''
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

create or replace function public.refund_edge_function_usage(fn_name text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  update public.edge_function_usage
  set call_count = greatest(public.edge_function_usage.call_count - 1, 0)
  where user_id = uid
    and function_name = fn_name
    and usage_date = (timezone('utc', now()))::date
  returning call_count into new_count;
  return coalesce(new_count, 0);
end;
$$;

revoke all on function public.increment_edge_function_usage(text) from public;
revoke all on function public.increment_edge_function_usage(text) from anon;
grant execute on function public.increment_edge_function_usage(text) to authenticated;

revoke all on function public.refund_edge_function_usage(text) from public;
revoke all on function public.refund_edge_function_usage(text) from anon;
grant execute on function public.refund_edge_function_usage(text) to authenticated;
