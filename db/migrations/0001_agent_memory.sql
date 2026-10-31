-- THE_LAB: persistent agent memory schema (Supabase / Postgres)
-- Requires pgvector for "most relevant memories" lookups.
create extension if not exists vector;

-- 1. Who exists in the world (AI characters AND the player)
create table characters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  is_player     boolean default false,
  persona       text,              -- core identity prompt: personality, backstory, voice
  traits        jsonb default '{}',-- e.g. {"openness":0.7,"jealousy":0.4}
  body_preset   jsonb default '{}',-- figure/anatomy slider values for the lab
  home_location text,
  created_at    timestamptz default now()
);

-- 2. Raw experience log: everything a character saw, heard, or did
create table memories (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references characters(id) on delete cascade,
  kind         text check (kind in ('observation','dialogue','action','reflection','plan')),
  content      text not null,       -- "Brax ignored me at the party"
  importance   smallint check (importance between 1 and 10), -- scored by LLM once, on write
  embedding    vector(1536),        -- for relevance search
  about_ids    uuid[] default '{}', -- characters this memory involves
  session_id   uuid,
  location     text,
  created_at   timestamptz default now(),
  last_used_at timestamptz default now() -- recency boost; touched when recalled
);
create index on memories (owner_id, created_at desc);
create index on memories using hnsw (embedding vector_cosine_ops);

-- 3. How each character feels about each other character (one row per direction)
create table relationships (
  owner_id    uuid references characters(id) on delete cascade,
  target_id   uuid references characters(id) on delete cascade,
  affection   real default 0,   -- -1 .. 1
  trust       real default 0,   -- -1 .. 1
  attraction  real default 0,   --  0 .. 1
  familiarity real default 0,   --  0 .. 1 (grows with time spent)
  summary     text,             -- "Thinks Brax is funny but flaky"
  updated_at  timestamptz default now(),
  primary key (owner_id, target_id)
);

-- 4. Current state: mood, needs, where they are, what they're doing
create table character_state (
  character_id uuid primary key references characters(id) on delete cascade,
  mood         jsonb default '{"valence":0,"energy":0.5}',
  needs        jsonb default '{"social":0.5,"rest":0.5,"hunger":0.5}',
  location     text,
  current_plan text,            -- today's plan, rewritten each morning
  current_task text,            -- what the reflex layer is animating now
  updated_at   timestamptz default now()
);

-- 5. Play sessions + party events (so "tonight" is a thing they can remember)
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  kind       text check (kind in ('solo','party','visit')),
  location   text,
  attendees  uuid[] default '{}',
  started_at timestamptz default now(),
  ended_at   timestamptz
);

-- Relevance recall: blends similarity, importance, and recency.
create or replace function recall(p_owner uuid, p_query vector(1536), p_limit int default 12)
returns setof memories language sql stable as $$
  select * from memories
  where owner_id = p_owner
  order by
      (1 - (embedding <=> p_query)) * 0.5
    + (importance / 10.0)          * 0.3
    + exp(-extract(epoch from now() - last_used_at) / 604800.0) * 0.2  -- ~1 week decay
    desc
  limit p_limit;
$$;
