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
