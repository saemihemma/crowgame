-- 001_errors.sql — client error ingestion.
--
-- Two tables with two different retentions, because they answer two different
-- questions:
--
--   error_groups  "what is broken, how often, since when"   -> keep forever, tiny
--   error_events  "what exactly happened that one time"     -> keep 30 days, fat
--
-- The thing that keeps this from becoming the problem it is meant to observe:
-- a raw event row is only stored while its group is under an hourly cap. Past
-- that we just increment a counter. A thousand children hitting one bug costs a
-- thousand cheap upserts, not a thousand fat rows. Sampling would be the obvious
-- alternative and it is worse here, because it makes RARE bugs invisible — and
-- rare bugs are exactly what we are trying to see.

create table if not exists error_groups (
    fingerprint        text primary key,
    first_seen_at      timestamptz not null default now(),
    last_seen_at       timestamptz not null default now(),
    event_count        bigint      not null default 0,
    -- Raw-storage throttle state. Reset lazily when the hour rolls over, so no
    -- background job is needed to keep the cap correct.
    raw_window_started timestamptz not null default now(),
    raw_in_window      integer     not null default 0,
    release            text,
    level              text        not null default 'error',
    kind               text,
    message            text        not null,
    source             text,
    sample_event       jsonb,
    status             text        not null default 'open'
        check (status in ('open', 'acknowledged', 'resolved', 'ignored'))
);

create index if not exists error_groups_last_seen_idx
    on error_groups (last_seen_at desc);
create index if not exists error_groups_open_idx
    on error_groups (status, last_seen_at desc) where status = 'open';

-- Partitioned by day so that retention is DROP TABLE, not DELETE.
--
-- This is the whole point. `DELETE FROM error_events WHERE occurred_at < ...` on
-- a busy append-only table leaves dead tuples behind and puts the cleanup cost on
-- autovacuum — it is the trap hiding inside "good cleaning mechanisms". Dropping
-- a day partition is O(1) and returns the disk immediately.
--
-- The partition key must be part of the primary key, hence (occurred_at, id).
create table if not exists error_events (
    id           uuid        not null default gen_random_uuid(),
    occurred_at  timestamptz not null default now(),
    fingerprint  text        not null references error_groups (fingerprint) on delete cascade,
    release      text,
    level        text        not null default 'error',
    kind         text,
    message      text        not null,
    source       text,
    stack        text,
    -- Coarse only. No child id, no display name, no free-text from the player.
    context      jsonb,
    user_agent   text,
    ip_prefix    inet,
    primary key (occurred_at, id)
) partition by range (occurred_at);

create index if not exists error_events_fingerprint_idx
    on error_events (fingerprint, occurred_at desc);

-- Safety net. Without it, an insert for a day whose partition does not exist
-- fails and the error report is lost — the worst possible failure for the one
-- system whose job is telling us about failures. Maintenance drains this.
create table if not exists error_events_default partition of error_events default;

-- Create the daily partitions for [from_date, from_date + days).
-- Idempotent, so maintenance can call it every run.
create or replace function error_events_ensure_partitions(from_date date, days int)
returns int language plpgsql as $$
declare
    d date;
    i int := 0;
    part text;
begin
    for offs in 0 .. days - 1 loop
        d := from_date + offs;
        part := format('error_events_%s', to_char(d, 'YYYYMMDD'));
        if not exists (select 1 from pg_class where relname = part) then
            execute format(
                'create table %I partition of error_events for values from (%L) to (%L)',
                part, d, d + 1);
            i := i + 1;
        end if;
    end loop;
    return i;
end $$;

-- Drop day partitions entirely older than the retention window.
-- Returns the partition names dropped, so the job can log what it did.
create or replace function error_events_drop_old_partitions(retain_days int)
returns setof text language plpgsql as $$
declare
    cutoff date := (now() at time zone 'utc')::date - retain_days;
    r record;
begin
    for r in
        select c.relname
        from pg_class c
        join pg_inherits i on i.inhrelid = c.oid
        join pg_class p on p.oid = i.inhparent
        where p.relname = 'error_events'
          and c.relname ~ '^error_events_[0-9]{8}$'
          and to_date(right(c.relname, 8), 'YYYYMMDD') < cutoff
    loop
        execute format('drop table if exists %I', r.relname);
        return next r.relname;
    end loop;
end $$;
