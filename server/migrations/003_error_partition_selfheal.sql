-- 003_error_partition_selfheal.sql — partition creation that survives strays.
--
-- The race this closes: an error event that arrives BEFORE the day's partition
-- exists (first event after UTC midnight, before the retention cron has run —
-- or simply a fresh database) lands in error_events_default. The original
-- ensure function then failed forever on that day: CREATE TABLE .. PARTITION OF
-- refuses to attach a range the default partition already holds rows for,
-- which turned one early event into a permanently failing maintenance job.
--
-- The replacement creates the partition standalone, moves the stray rows into
-- it, and attaches — all inside the function's single transaction, so readers
-- never see the rows vanish or double.

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
            execute format('create table %I (like error_events including all)', part);
            execute format(
                'insert into %I select * from error_events_default
                  where occurred_at >= %L and occurred_at < %L',
                part, d, d + 1);
            execute format(
                'delete from error_events_default
                  where occurred_at >= %L and occurred_at < %L',
                d, d + 1);
            execute format(
                'alter table error_events attach partition %I for values from (%L) to (%L)',
                part, d, d + 1);
            i := i + 1;
        end if;
    end loop;
    return i;
end $$;
