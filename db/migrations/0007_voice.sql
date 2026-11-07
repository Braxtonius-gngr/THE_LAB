-- 0007 · voice: each character keeps one ElevenLabs voice
alter table public.characters add column if not exists voice_id text, add column if not exists voice_name text;
