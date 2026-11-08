-- 0011 · push: the phone buzzes when one of them texts first, page closed or not.
-- Browser push subscriptions per player, and the VAPID signing key, which the `push` function
-- makes on first use and keeps in the private schema (read through security-definer functions,
-- service role only - it never leaves the database or passes through a chat).
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  player_id  uuid references public.characters(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_player on public.push_subscriptions (player_id);
alter table public.push_subscriptions enable row level security;   -- service role only

create schema if not exists private;
create table if not exists private.vapid (
  id         int primary key default 1 check (id = 1),
  jwk        jsonb not null,       -- the private key (JWK, P-256)
  public_key text not null,        -- uncompressed point, base64url: what PushManager.subscribe wants
  created_at timestamptz not null default now()
);
create or replace function public.vapid_get() returns table (jwk jsonb, public_key text)
  language sql security definer set search_path = '' stable
  as $$ select v.jwk, v.public_key from private.vapid v where v.id = 1 $$;
create or replace function public.vapid_set(p_jwk jsonb, p_public_key text) returns void
  language sql security definer set search_path = ''
  as $$ insert into private.vapid (id, jwk, public_key) values (1, p_jwk, p_public_key) on conflict (id) do nothing $$;
revoke all on function public.vapid_get() from public, anon, authenticated;
revoke all on function public.vapid_set(jsonb, text) from public, anon, authenticated;
grant execute on function public.vapid_get() to service_role;
grant execute on function public.vapid_set(jsonb, text) to service_role;
