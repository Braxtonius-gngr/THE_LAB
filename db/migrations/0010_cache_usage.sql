-- 0010 · the usage counter learns about the prompt cache: the mind's stable block (persona + how
-- to answer) is cached between turns; reads are billed at a fraction, writes at a premium.
alter table public.api_usage
  add column if not exists cache_read_tokens int default 0,
  add column if not exists cache_write_tokens int default 0;
