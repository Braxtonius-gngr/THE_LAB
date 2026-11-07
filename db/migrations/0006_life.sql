-- 0006 · life: the characters' lives go on between visits.
-- Every 4 hours pg_cron calls the `life` edge function, which lives the hours since the last
-- tick for everyone (supabase/functions/life). Each tick is logged here.
create table if not exists public.life_ticks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  hours real,
  story jsonb
);
alter table public.life_ticks enable row level security;   -- no policies: service role only

-- the scheduler's key: made here, kept here; the function checks it through life_key_ok()
create schema if not exists private;
create table if not exists private.life_key (k text primary key);
insert into private.life_key (k) select encode(extensions.gen_random_bytes(24), 'hex') where not exists (select 1 from private.life_key);
create or replace function public.life_key_ok(k text) returns boolean
  language sql security definer set search_path = '' stable
  as $$ select exists (select 1 from private.life_key where private.life_key.k = life_key_ok.k) $$;
revoke all on function public.life_key_ok(text) from public, anon, authenticated;
grant execute on function public.life_key_ok(text) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;
-- every 4 hours, on the hour plus 7 minutes
select cron.unschedule('life') where exists (select 1 from cron.job where jobname = 'life');
select cron.schedule('life', '7 */4 * * *', $$
  select net.http_post(
    url := 'https://qyphdwcjzhgobsfpeonh.supabase.co/functions/v1/life',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-life-key', (select k from private.life_key limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$$);
