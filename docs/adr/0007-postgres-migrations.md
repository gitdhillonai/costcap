# ADR 0007: Postgres migrations stay out of the running service

Date: 2026-10-07. Status: accepted for CI proof. Production still uses the JSON file.

## Decision

`db/migrations/` creates `costcap_migrate` and `costcap_app`. The migration role owns the tables. The application role receives DML and does not receive schema CREATE. `test/migrate.test.js` starts Postgres, rolls a migration transaction back, applies the files, checks ownership, and applies the down file. `src/hosted/run.js` does not read `DATABASE_URL`. `/health` keeps reporting `single-process-file`.

## Consequences

Issue #42 stays open until a deployed service reports a database backend. These files do not change the running store.
