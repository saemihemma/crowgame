-- Learner backend schema for Crow.
-- Status: Design companion artifact, not a shipped backend implementation.
-- Authority: Backend schema companion to docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md.
-- Last verified against code: 2026-03-22.
-- Target: managed Postgres-style backend with parent-owned families and per-child learning state.
-- Runtime sync metadata still lives in local save and learner snapshot state until a backend is actually deployed.
-- Projection fields in this schema are convenience/reporting fields, not necessarily authoritative storage.

create table if not exists parent_accounts (
    id uuid primary key,
    email text unique,
    display_name text not null,
    created_at timestamptz not null default now()
);

create table if not exists child_profiles (
    id uuid primary key,
    parent_account_id uuid not null references parent_accounts(id) on delete cascade,
    family_id uuid not null,
    username text not null,
    pin_hash text not null,
    created_at timestamptz not null default now(),
    unique (username)
);

create table if not exists child_domain_mastery (
    child_profile_id uuid not null references child_profiles(id) on delete cascade,
    domain text not null,
    global_elo numeric not null,
    domain_modifier numeric not null,
    confidence_offset numeric not null default 0,
    effective_selection_elo numeric not null,
    first_attempt_accuracy numeric not null default 0,
    review_backlog integer not null default 0,
    backlog_trend text not null default 'stable',
    unlocked boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (child_profile_id, domain)
);

create table if not exists child_skill_state (
    child_profile_id uuid not null references child_profiles(id) on delete cascade,
    domain text not null,
    skill text not null,
    active_review boolean not null default false,
    review_stage text not null default 'graduated',
    successful_reviews integer not null default 0,
    last_outcome text not null default 'correct',
    due_at timestamptz,
    due_after_attempt integer,
    updated_at timestamptz not null default now(),
    primary key (child_profile_id, domain, skill)
);

create table if not exists attempt_events (
    -- Maps directly to runtime LearnerAttemptSubmission.attemptId and serves as the idempotency key.
    id uuid primary key,
    child_profile_id uuid not null references child_profiles(id) on delete cascade,
    problem_id text not null,
    domain text not null,
    skills jsonb not null,
    correct boolean not null,
    first_attempt boolean not null,
    hints_used integer not null default 0,
    response_ms integer not null,
    problem_elo integer not null,
    selection_lane text not null,
    review_item_id uuid,
    answered_at timestamptz not null,
    created_at timestamptz not null default now()
);

create table if not exists review_items (
    id uuid primary key,
    child_profile_id uuid not null references child_profiles(id) on delete cascade,
    domain text not null,
    skill text not null,
    source_problem_id text not null,
    anchor_problem_elo integer not null,
    stage text not null,
    due_at timestamptz,
    due_after_attempt integer,
    successful_reviews integer not null default 0,
    last_outcome text not null,
    updated_at timestamptz not null default now()
);

create index if not exists idx_child_profiles_parent on child_profiles(parent_account_id);
create index if not exists idx_child_domain_mastery_domain on child_domain_mastery(domain);
create index if not exists idx_child_skill_state_review on child_skill_state(child_profile_id, active_review, due_at);
create index if not exists idx_attempt_events_child_answered on attempt_events(child_profile_id, answered_at desc);
create index if not exists idx_review_items_due on review_items(child_profile_id, domain, due_at, due_after_attempt);
