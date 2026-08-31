-- 007_username_pin_accounts.sql — a username and a PIN are the whole account.
--
-- THIS REVERSES A DOCUMENTED DECISION, so the reason is here rather than in a
-- commit message. 002 says, in as many words: "There is NO pin_hash column. The
-- 4-digit PIN is a 'which kid am I' selector and never leaves the device." That
-- was right for what the game was then: a household tablet, one family, cloud
-- save as an optional extra you enrolled in by email.
--
-- The owner's decision (2026-08) is that a child should be able to sign in to
-- their own progress from any machine -- "I wanna log into my progress at work
-- tomorrow" -- with nothing but a username and a PIN, and nothing else at all
-- during the trial. That makes the PIN a credential, and a credential has to be
-- stored like one.
--
-- WHAT A 4-DIGIT PIN IS WORTH, stated plainly so nobody has to rediscover it:
-- ~13 bits. It is not a password and cannot be made into one by hashing. What
-- makes it safe enough here is that guessing has to happen ONLINE, so the fence
-- is the attempt limit, not the secret:
--
--   * failed_attempts / locked_until below lock an account after a handful of
--     misses, and the lock is per ACCOUNT, so spreading an attack across IPs
--     does not help;
--   * the route is additionally rate-limited per IP at the edge;
--   * and the only thing behind it is one child's maths progress -- no payment
--     details, no messaging, no way to reach another family.
--
-- If this ever guards more than that, the PIN is not enough and this migration
-- is the thing to come back to.
--
-- scrypt, not SHA-256: unlike the device tokens in 002 this IS a low-entropy
-- human secret, which is the exact case a slow KDF exists for. See
-- server/src/lib/pinAuth.ts.

create table if not exists accounts (
    id             uuid primary key default gen_random_uuid(),
    family_id      uuid not null references families (id) on delete cascade,
    child_id       uuid references children (id) on delete set null,
    -- citext and globally unique: the account IS the login, so two families
    -- cannot both hold "Saemi". Scoped uniqueness works for a display name
    -- (see children) and cannot work for a credential.
    username       citext not null unique
                   check (length(username) between 2 and 24),
    pin_hash       text not null,
    created_at     timestamptz not null default now(),
    last_login_at  timestamptz,
    -- The fence. Per account rather than per IP, because an attacker with a
    -- guessable username has all the IPs they want and only one PIN to find.
    failed_attempts integer not null default 0,
    locked_until    timestamptz
);
create index if not exists accounts_family_idx on accounts (family_id);

-- No RLS, and the same reason parents/devices/device_tokens/login_codes have
-- none: the username lookup has to happen BEFORE a family is known, so a policy
-- comparing against app.family_id would need the answer the lookup is producing.
-- test/role-isolation.test.ts subtracts this table by name and states the reason
-- there too; the protected set is DERIVED from the foreign-key walk, so a table
-- added here without a decision fails that test rather than passing silently.
grant select, insert, update, delete on accounts to crow_app;
