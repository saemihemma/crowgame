-- 002_family_and_save.sql — family identity, device enrollment, cloud save.
--
-- Shape follows docs/API_CONTRACT.md. The decisions worth restating here,
-- because the schema is where they become permanent:
--
--   * The authorization subject is the DEVICE, scoped to a family. Never the
--     child. The client mints childId per device ("child-<ms>-<rand>"), so the
--     same child on an iPad and a laptop has two different local ids — it is a
--     device-local handle, not identity, and cannot be a join key.
--   * There is NO pin_hash column. The client's _hash_pin() is
--     btoa(pin + ':' + username), reversible by inspection. The 4-digit PIN is a
--     "which kid am I" selector and never leaves the device.
--   * The sync unit is the whole save blob, arbitrated by problems_attempted.
--   * attempt_id is TEXT, not uuid: the client generates "attempt-<ms>-<rand>".
--
-- The only PII here is a parent email address.

create extension if not exists citext;

-- ── identity ────────────────────────────────────────────────────────────────

create table if not exists families (
    id         uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists parents (
    id            uuid primary key default gen_random_uuid(),
    family_id     uuid not null references families (id) on delete cascade,
    email         citext not null unique,
    created_at    timestamptz not null default now(),
    last_login_at timestamptz
);
create index if not exists parents_family_idx on parents (family_id);

create table if not exists children (
    id           uuid primary key default gen_random_uuid(),
    family_id    uuid not null references families (id) on delete cascade,
    display_name text not null check (length(display_name) between 1 and 40),
    created_at   timestamptz not null default now(),
    deleted_at   timestamptz,
    -- Scoped to the family, NOT global. A globally unique name would reject the
    -- second family that has a child called Emma.
    unique (family_id, display_name)
);
create index if not exists children_family_idx on children (family_id);

-- Maps a device's local childId onto the server child, so enrolling a second
-- device cannot silently create a duplicate child.
create table if not exists child_aliases (
    family_id       uuid not null references families (id) on delete cascade,
    legacy_child_id text not null,
    child_id        uuid not null references children (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (family_id, legacy_child_id)
);

create table if not exists devices (
    id           uuid primary key default gen_random_uuid(),
    family_id    uuid not null references families (id) on delete cascade,
    label        text,
    user_agent   text,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz,
    revoked_at   timestamptz
);
create index if not exists devices_family_idx on devices (family_id);

-- Only the SHA-256 of a device token is stored. A leaked database therefore
-- cannot be replayed as a set of live credentials.
create table if not exists device_tokens (
    id           uuid primary key default gen_random_uuid(),
    device_id    uuid not null references devices (id) on delete cascade,
    token_sha256 bytea not null unique,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    revoked_at   timestamptz
);

-- Magic-link tokens and second-device pairing codes share this table: both are
-- single-use, short-lived secrets that trade up for a device token.
create table if not exists login_codes (
    id          uuid primary key default gen_random_uuid(),
    purpose     text not null check (purpose in ('email_link', 'device_pairing')),
    email       citext,
    family_id   uuid references families (id) on delete cascade,
    code_sha256 bytea not null unique,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    consumed_at timestamptz,
    attempts    smallint not null default 0
);
create index if not exists login_codes_email_idx on login_codes (email, created_at desc);

-- ── state ───────────────────────────────────────────────────────────────────

create table if not exists child_saves (
    child_id           uuid primary key references children (id) on delete cascade,
    family_id          uuid not null references families (id) on delete cascade,
    save               jsonb not null,
    save_version       integer not null,
    -- The arbiter. Monotonic, already in the client's eloStats, and it only
    -- advances on real play: "the device that has seen more of this child's
    -- answers wins" is explainable to a parent in one sentence.
    problems_attempted integer not null default 0,
    client_timestamp   bigint  not null default 0,
    server_version     bigint  not null default 1,
    updated_by_device  uuid references devices (id) on delete set null,
    updated_at         timestamptz not null default now()
);
create index if not exists child_saves_family_idx on child_saves (family_id);

-- Keeps a bad merge a support action rather than a loss.
create table if not exists child_save_history (
    child_id       uuid not null references children (id) on delete cascade,
    family_id      uuid not null references families (id) on delete cascade,
    server_version bigint not null,
    save           jsonb not null,
    created_at     timestamptz not null default now(),
    primary key (child_id, server_version)
);

-- Append-only record. Not the transport for state — the client snapshot cannot
-- be reproduced by replay, because _get_review_gap() uses randi() and review ids
-- embed randomness — but it is the durable answer to "was my child's work lost",
-- and the substrate for any future server-authoritative reducer.
create table if not exists attempts (
    child_id        uuid not null references children (id) on delete cascade,
    family_id       uuid not null references families (id) on delete cascade,
    attempt_id      text not null,
    seq             bigserial not null,
    problem_id      text,
    domain          text,
    correct         boolean,
    first_attempt   boolean,
    hints_used      smallint,
    response_ms     integer,
    problem_elo     integer,
    curriculum_step smallint,
    selection_lane  text,
    review_item_id  text,
    -- answered_at is a child's tablet clock and is not trusted; received_at is
    -- ours, and seq is the ordering that actually means anything.
    answered_at     timestamptz,
    received_at     timestamptz not null default now(),
    device_id       uuid references devices (id) on delete set null,
    primary key (child_id, attempt_id)
);
create index if not exists attempts_child_seq_idx on attempts (child_id, seq);
create index if not exists attempts_child_answered_idx on attempts (child_id, answered_at desc);

-- Instrumentation, not a feature. v1 accepts that a device which played offline
-- while another device played more loses that session's cosmetic progress; this
-- table is how that assumption gets revisited with numbers instead of guesses.
create table if not exists sync_conflicts (
    id                 uuid primary key default gen_random_uuid(),
    child_id           uuid not null references children (id) on delete cascade,
    family_id          uuid not null references families (id) on delete cascade,
    device_id          uuid references devices (id) on delete set null,
    incoming_attempted integer not null,
    stored_attempted   integer not null,
    outcome            text not null check (outcome in ('accepted', 'rejected')),
    created_at         timestamptz not null default now()
);
create index if not exists sync_conflicts_created_idx on sync_conflicts (created_at desc);

-- ── row-level security ──────────────────────────────────────────────────────
--
-- Defence in depth: every query also goes through one family-scoped data-access
-- module, but a single forgotten WHERE clause in a store of children's data
-- should not be able to leak another family's rows.
--
-- FORCE is essential. Railway's DATABASE_URL user owns these tables, and a table
-- owner BYPASSES its own RLS policies unless forced — without this line the
-- policies below would be decorative.
--
-- Auth tables (parents, devices, device_tokens, login_codes) deliberately have no
-- RLS: resolving a token to a family has to happen BEFORE a family is known.
--
-- FORCE alone is still not enough, and this is the part that is easy to ship
-- broken: a SUPERUSER bypasses row-level security unconditionally. Railway's
-- managed Postgres hands you a superuser in DATABASE_URL, so policies would have
-- been decorative in production. Verified locally: as the superuser, one family
-- could read the other's children and insert rows into it.
--
-- So the app does not run as that role. It runs as crow_app — NOLOGIN (reachable
-- only via SET ROLE, never a direct connection), not a superuser, and without
-- BYPASSRLS. Every request transaction does:
--
--     SET LOCAL ROLE crow_app;
--     SET LOCAL app.family_id = '<uuid>';
--
-- and RLS then actually applies. LOCAL means both revert at commit or rollback,
-- so a pooled connection cannot leak either setting into the next request.

create or replace function current_family_id() returns uuid language sql stable as $$
    select nullif(current_setting('app.family_id', true), '')::uuid
$$;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'crow_app') then
        create role crow_app nologin;
    end if;
end $$;

do $$
declare t text;
begin
    foreach t in array array['children', 'child_saves', 'child_save_history',
                             'attempts', 'sync_conflicts', 'child_aliases']
    loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format('drop policy if exists family_isolation on %I', t);
        execute format(
            'create policy family_isolation on %I using (family_id = current_family_id()) '
            'with check (family_id = current_family_id())', t);
    end loop;
end $$;

-- Privileges for the application role. Deliberately no DDL, no ownership, and
-- no DELETE on the append-only tables — attempts and save history are a record,
-- and the application has no reason to be able to rewrite one.
grant usage on schema public to crow_app;
grant select, insert, update, delete on
    families, parents, children, child_aliases, devices, device_tokens,
    login_codes, child_saves, sync_conflicts
    to crow_app;
grant select, insert on attempts, child_save_history, error_events to crow_app;
grant select, insert, update on error_groups to crow_app;
grant usage, select on all sequences in schema public to crow_app;

-- Save history is pruned to the last 20 versions per child, which is an UPDATE-
-- free operation the app does need to be able to perform.
grant delete on child_save_history to crow_app;
