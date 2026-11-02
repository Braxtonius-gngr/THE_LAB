-- A character only knows a visitor's name once it has been said to him; remembered here
-- so a long first visit (or a short history window) can't leak it back in.
alter table relationships add column if not exists knows_name boolean not null default false;
-- Brax already introduced himself to Marco (visit 1)
update relationships set knows_name = true where owner_id = '00000000-0000-4000-8000-000000000101' and target_id = '00000000-0000-4000-8000-000000000001';
