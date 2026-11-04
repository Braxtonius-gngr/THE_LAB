-- Needs: slow drives that rise and fall with time and what the character does.
-- 0 = fully met, 1 = urgent. energy is the exception: 1 = rested, 0 = exhausted.
alter table character_state add column if not exists needs jsonb not null default '{"energy":0.7,"hunger":0.3,"social":0.4,"intimacy":0.4,"comfort":0.2}'::jsonb;
alter table character_state add column if not exists needs_at timestamptz not null default now();
