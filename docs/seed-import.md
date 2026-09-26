# Importing seed data into the app database

`scripts/apply-seed.mjs` loads the personal seed data into a real app's
`finance.db`, so Wealthflow has data in the installed app rather than only in
the dev panel.

- [What it does](#what-it-does)
- [Before you run it](#before-you-run-it)
- [Running it](#running-it)
- [Choosing the database](#choosing-the-database)
- [Reading the output](#reading-the-output)
- [Re-running and undoing](#re-running-and-undoing)
- [Changing the seed data](#changing-the-seed-data)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)

## What it does

1. Resolves which `finance.db` to write (see [below](#choosing-the-database))
2. Takes a write lock to check nothing else is holding the database
3. Backs the database up, unless `--no-backup`
4. Runs `src/seed/wealth-seed.sql` inside a single transaction
5. Prints row counts, per-bank totals and FY totals
6. Runs five audits, two of which must return no rows, and exits non-zero if
   any fails

The data itself lives in `src/seed/wealth-seed.sql`, which is gitignored along
with the rest of `src/seed/` and never reaches the extension bundle. The script
and the SQL it runs are separate: the script holds no financial data of its own,
so it is safe to commit.

## Before you run it

1. **Install the extension in the target app and restart it.** That makes the
   app create the `wealthflow_*` tables, so it owns its own schema. The SQL can
   create them too, and the statements are byte-identical to what the app
   generates, but installing first is the better route.
2. **Close the app completely** — every window and tray process. The script
   refuses to run if the database is locked, but in WAL mode a running app does
   not hold a write lock between transactions, so the check cannot prove the app
   is closed. The script prints a `note:` when the database is in WAL mode as a
   reminder.

## Running it

From the project directory:

```bash
node scripts\apply-seed.mjs
```

That is the whole command. `better-sqlite3` is compiled against Electron's ABI,
which a system Node cannot load, so the script detects that and **relaunches
itself under Electron's Node** and carries on. You do not need to set
`ELECTRON_RUN_AS_NODE` yourself.

Expected output on a first run into an empty database:

```text
database: C:\Users\<you>\AppData\Roaming\Finance Flow AI Dev\finance.db
script:   D:\finance_flow_ext\wealthflow\src\seed\wealth-seed.sql
note:      WAL mode -- close the app before trusting this run
backup:   ...\finance.db.preseed-2026-09-26T17-12-41-743Z.bak

inserted:
  banks        4 rows  (+4)
  stocks       3 rows  (+3)
  interest     8 rows  (+8)
  dividends    2 rows  (+2)

audits:
  1. Row counts
        {"table_name":"banks","rows":4}
        ...
  2. Interest per bank for FY 2026-2027 (...)
        {"bank_code":"ANZ","interest":0.62}
        {"bank_code":"BOQ","interest":3.23}
        {"bank_code":"MQL","interest":1.46}
        {"bank_code":"UBANK","interest":0.63}
  3. Taxable totals for FY 2026-2027 (...)
        {"taxable_gross":115.88,"franking_credits":24.83}
  PASS  4. FY consistency. Must return NO rows: ...
  PASS  5. Orphan check. Must return NO rows: ...

Done. Start the app and open Wealth Flow.
```

> This document quotes the seed's real figures so you can recognise a successful
> run. It is committed, so those numbers are in git history.

## Choosing the database

A dev and a production install can both exist, each with its own `finance.db`,
and the production one may live outside `%APPDATA%`. The target is resolved in
this order:

| Priority | Source | Example |
| --- | --- | --- |
| 1 | First non-flag argument | `node scripts\apply-seed.mjs` |
| 2 | `$WEALTHFLOW_DB` | `$env:WEALTHFLOW_DB = 'D:\...\finance.db'` |
| 3 | The single match under `%APPDATA%` | `node scripts\apply-seed.mjs` |

With more than one candidate under `%APPDATA%` the script **refuses to guess**
and lists them, rather than picking one in an arbitrary order. Pass the path you
want.

Two databases in use on this machine:

| Install | Database |
| --- | --- |
| Dev | `%APPDATA%\Finance Flow AI Dev\finance.db` |
| Prod | `D:\Finance Flow Product\data\finance.db` (WAL mode) |

```bash
# dev
node scripts\apply-seed.mjs

# prod
node scripts\apply-seed.mjs "D:\Finance Flow Product\data\finance.db"
```

### Flags

| Flag | Effect |
| --- | --- |
| `--no-backup` | Skip the pre-seed backup. Only for a throwaway database. |

Flags are never mistaken for the path, so the flag may come first or last.

## Reading the output

| Line | Meaning |
| --- | --- |
| `database:` | The file that was written. Trust this before the rest. |
| `note: WAL mode` | Reminder that a running app evades the lock probe. |
| `note: no wealthflow_* tables yet` | SQL made the tables. Install first. |
| `backup:` | Path to the pre-seed copy. Note it down. |
| `+N` in `inserted:` | Rows added. `+0` everywhere means nothing new. |
| audits 1–3 | Reports. Compare against the figures in your own seed. |
| audits 4–5 | Must both be `PASS`. They return no rows, or the run failed. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Imported, and every audit passed. |
| `1` | Nothing usable: target unresolved, DB locked, or an audit failed. |

The rows are written in one transaction, so a failure part-way leaves the
database as it was.

## Re-running and undoing

**Re-running is safe.** Every insert is guarded by a `NOT EXISTS` check, so a
second run adds nothing and reports `+0` everywhere. The seed's own logic is
idempotent in the same way.

**To undo**, restore the backup the run printed:

1. Close the app completely.
2. Copy the `.bak` over `finance.db`.
3. **Delete the `-wal` and `-shm` sidecar files next to it.** They belong to the
   newer database, and leaving them can replay old frames over the copy you just
   restored. This is the step that turns a restore into a corruption.

```bash
# example
copy /Y "...\finance.db.preseed-<stamp>.bak" "...\finance.db"
del "...\finance.db-wal" "...\finance.db-shm"
```

If there is no backup, the four tables can be dropped, since they hold nothing
but seed data:

```sql
DROP TABLE wealthflow_interest_entries;
DROP TABLE wealthflow_dividends;
DROP TABLE wealthflow_banks;
DROP TABLE wealthflow_stocks;
```

Dropping and recreating is also the way to change the schema later: the app only
runs `CREATE TABLE IF NOT EXISTS`, so it will never migrate a table that already
exists.

## Changing the seed data

There are two copies of the seed, and **both need editing**:

| File | Used by |
| --- | --- |
| `src/seed/wealth-seed.ts` | the dev panel (`?seed=1`, or the console) |
| `src/seed/wealth-seed.sql` | this script |

They are not generated from one another, so nothing keeps them in sync. After
editing the SQL, run:

```bash
npm test -- tests/seed-sql.test.ts
```

That checks the DDL against the manifest, the insert guards, the row counts and
the totals, against a real SQLite engine. It does **not** compare the SQL to the
TypeScript seed, so a change made in only one of them will not be caught.

If you change a date to a different month, audit 4 recomputes the expected
financial year per row and will fail if the stored `finance_year` no longer
matches. July-start years are assumed, matching the app.

## Troubleshooting

**`Found 2 databases, so refusing to guess which one you meant`**
Expected with two installs. Pass the path you want.

**`No finance.db under %APPDATA%\Finance Flow*`**
Auto-discovery cannot see that install — it is probably outside `%APPDATA%`. Pass
the path.

**`Cannot get a write lock on the database`**
The app still has the file open. Close every Finance Flow window and any tray
process, then run again.

**`no such table: wealthflow_*`**
Should not happen: the SQL creates the tables. If it does, the run was against a
database you did not intend, or an earlier version of the SQL is in play.

**`NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED`**
Should not happen: the script relaunches itself under Electron. If you see it
anyway, the relaunch failed — run the SQL directly in any SQLite client, which
is a supported fallback:

```text
src/seed/wealth-seed.sql
```

**Combined taxable shows $0.00 with data present**
The card reads the public service, and it only shows a non-zero figure when the
service and the requested financial year agree. Compare audit 4 and the FY on
screen; they must be the same year.

## How it works

- `scripts/apply-seed.mjs` — the runner
- `scripts/db-target.mjs` — which database to write, and the refusal when there
  is more than one candidate
- `scripts/sql-audit.mjs` — splits the SQL's audit block into statements
  SQLite can prepare
- `src/seed/wealth-seed.sql` — the data, gitignored
- `tests/seed-sql.test.ts` — verifies all of the above without touching a real
  database

The audit block is separated from the writes by a `-- @@AUDITS@@` marker. The
splitter is line-based rather than a `split(';')`, because the audit header
contains a semicolon inside a comment, and splitting on `;` first would leave
prose where a statement should be.
