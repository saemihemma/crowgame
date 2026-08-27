-- 006_play_pings.sql — make session length honest for play that never met an owl.
--
-- The admin overview derived sessions by splitting ATTEMPT timestamps on a
-- 30-minute gap, so a child who ran, jumped, collected coins and never opened a
-- maths board left no trace in the numbers the owner reads. Session length in
-- particular was not "how long they played", it was "how long they were doing
-- maths", and for a platformer those are not close.
--
-- A ping is one row: this child was playing at this moment. The client sends one
-- when a level starts and then every few minutes while it runs, batched the way
-- attempts are. Sessions stay a gap-split -- the same window, the same config --
-- over a stream that now covers the whole session.
--
-- Deliberately not an events table. No event type, no payload, and no room for
-- one: the moment this becomes a general telemetry sink it acquires a schema
-- nobody owns, and the only question asked of it is "was anyone playing".
-- Anything richer already belongs in attempts.

create table if not exists play_pings (
    child_id    uuid not null references children (id) on delete cascade,
    family_id   uuid not null references families (id) on delete cascade,
    -- Our clock, never the tablet's -- same rule as every other analytics
    -- column. A device with a wrong date would otherwise move the dashboard.
    received_at timestamptz not null default now()
);

-- The overview windows on received_at across all children and then partitions by
-- child to find gaps, so lead with the window and carry the child.
create index if not exists play_pings_received_idx on play_pings (received_at, child_id);
-- Per-child deletes and the retention sweep go the other way round.
create index if not exists play_pings_child_idx on play_pings (child_id, received_at);

-- Same isolation as every other family-scoped table, through the same helper.
-- The pool role the admin surface runs as bypasses it, which is the entire point
-- of that surface: it aggregates across families.
alter table play_pings enable row level security;
alter table play_pings force row level security;
drop policy if exists family_isolation on play_pings;
create policy family_isolation on play_pings
    using (family_id = current_family_id())
    with check (family_id = current_family_id());

-- Append-only, like attempts: a ping is a record that someone was playing, and
-- the application has no reason to be able to rewrite one.
grant select, insert on play_pings to crow_app;
