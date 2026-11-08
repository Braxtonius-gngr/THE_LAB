-- 0009 · texts: a thread with each of them on your phone (world/text.html).
-- A text exchange is a session of kind 'text' (so it doesn't count as a visit), and when his
-- off-screen life (supabase/functions/life) has him reach out first, the message waits here
-- until the thread is next opened.
alter table public.sessions drop constraint if exists sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('solo','party','visit','text'));

create table if not exists public.outbox (
  id         bigint generated always as identity primary key,
  from_id    uuid references public.characters(id) on delete cascade,
  to_id      uuid references public.characters(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists outbox_unseen on public.outbox (to_id, from_id) where seen_at is null;
alter table public.outbox enable row level security;   -- no policies: service role only
