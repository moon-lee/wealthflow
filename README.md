# Wealthflow — Finance Flow AI Extension

## Dev (standalone)
```bash
npm install
npm run dev   # http://localhost:5173
```

## Build + Install
```bash
npm run build   # or: node D:/finance_flow_ai/scripts/sdk/cli.mjs build .
# Then in Finance Flow AI: Extensions → Install Folder → pick build/extension → Restart
```

Uses `src/styles/*` (tokens + layout) and `finance-logger` for consistent UI/logging.

## Seed data into the app database
```bash
# close the app first, then:
node scripts\apply-seed.mjs                                        # dev
node scripts\apply-seed.mjs "D:\Finance Flow Product\data\finance.db"   # prod
```
Backs up, imports idempotently, then audits the result. See [docs/seed-import.md](docs/seed-import.md).

## Where things are documented

| | |
| --- | --- |
| Design and the reasoning behind it | [docs/superpowers/specs/](docs/superpowers/specs) — start with the 2026-10-16 trades/CGT spec and the 2026-10-21 portfolio summary spec |
| **How each Investment column is calculated** | [2026-10-21 spec §5.10](docs/superpowers/specs/2026-10-21-wealthflow-portfolio-summary-design.md) — the single reference for the formulas and where each input comes from |
| The holdings themselves | [docs/](docs) — one file per holding, reconciled against the workbook |
| Seeding | [docs/seed-import.md](docs/seed-import.md) |
| Working on the code | [AGENTS.md](AGENTS.md) |
