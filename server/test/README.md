# Server tests

Status: Supportive
Authority: How to run the API test suite and why it is shaped this way.

Run against a real Postgres:

```bash
DATABASE_URL=postgres://... npm test
```

They skip cleanly with no `DATABASE_URL`, so a machine without a database does
not fail — but CI always sets one, so coverage never silently disappears.

## Why a real database

The two properties most worth proving here are SQL behaviour, not TypeScript
behaviour:

- the hourly raw-storage throttle for error events is one statement doing a lazy
  window reset, and
- retention is `DROP TABLE` on a day partition rather than a `DELETE`.

Mocking the database would test the mock. The same goes for row-level security:
the reason the API drops to a non-superuser role per transaction is that a
superuser bypasses RLS entirely — which was discovered by running it, not by
reading it.

That is now asserted rather than explained. `role-isolation.test.ts` proves the
mechanism against a real cluster — what `current_user` is on each path, that a
`select` with no family predicate returns one family's rows inside a family
transaction and every family's on the bare pool, and that the app role is refused
a `delete from attempts`. It exists because this paragraph was true of the design
and false of two of the four database entry points, with nothing to notice the
difference. Its first half needs no database: it fails the build if any route file
imports `withTransaction` or queries the pool directly.

## Why `--test-concurrency=1`

Both suites share one database, and `cloudsave.test.ts` truncates `families` in
its setup. Run in parallel, that setup can land while the other suite is
mid-flight. This has not been observed failing — it is a precaution, not a fix for
a known flake — but a shared mutable database is not something to run concurrently
and hope about.

## Why the write limit is raised

`CROW_SAVE_WRITES_PER_MIN=1000` is set here because the arbitration tests
deliberately perform many writes for one device, and the rate limiter would
throttle them. The limiter's *keying* — per device, not per IP, so one household
does not share a budget — has its own test that does not depend on the limit.
