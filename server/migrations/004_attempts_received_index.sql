-- 004_attempts_received_index.sql — the admin overview's access path.
--
-- Every overview query windows on received_at (our clock) across ALL children:
-- daily actives, sessions, accuracy. The existing indexes lead with child_id,
-- so those scans go sequential — invisible at one-family scale, a linear cost
-- as attempts grow. Index the window the dashboard actually uses.

create index if not exists attempts_received_idx on attempts (received_at);
