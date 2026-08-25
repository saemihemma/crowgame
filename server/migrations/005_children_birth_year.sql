-- 005_children_birth_year.sql — birth YEAR on a child, for grade derivation.
--
-- Year, deliberately not a date: Icelandic school grade is a function of birth
-- year alone (school starts the calendar year a child turns six — lög um
-- grunnskóla 91/2008, 15. gr.), so a full birth date adds zero information and
-- is data we would rather never hold about children. Nullable: existing
-- children, and any family that prefers not to say, simply get no
-- grade-comparison section in the parent report.

alter table children add column if not exists birth_year int
    check (birth_year is null or birth_year between 1990 and 2100);
