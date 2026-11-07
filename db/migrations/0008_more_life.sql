-- 0008 · more life: every 2 hours, a nightly reflection, and a usage counter
create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  fn text, model text, input_tokens int, output_tokens int
);
alter table public.api_usage enable row level security;   -- service role only
select cron.alter_job((select jobid from cron.job where jobname = 'life'), schedule := '7 */2 * * *');
-- 4:30 am San Antonio (10:30 UTC in winter, 9:30 in summer - close enough): they look back on the day
select cron.schedule('reflect', '30 10 * * *', $$
  select net.http_post(
    url := 'https://qyphdwcjzhgobsfpeonh.supabase.co/functions/v1/life',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-life-key', (select k from private.life_key limit 1)),
    body := '{"reflect": true}'::jsonb,
    timeout_milliseconds := 180000)
$$);
