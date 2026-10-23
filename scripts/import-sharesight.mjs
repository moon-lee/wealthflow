import { readFileSync } from 'node:fs';
import { readSheet1 } from './xlsx-read.mjs';

/** The three held positions. Everything else in the workbook is ignored. */
export const HELD_CODES = ['VAS', 'VHY', 'FGX'];

/**
 * Reconciled against docs/AllTradesReport.xlsx on 2026-10-17, and against the
 * owner's copy of the VHY rows on 2026-10-22. The importer refuses to write
 * unless every figure below matches, so a parsing regression cannot quietly
 * install a wrong ledger.
 */
export const EXPECTED = {
  VAS: { rows: 32, units: 165, costBase: 15238.16 },
  // VHY's third reinvestment (16 Jul 2026) bought ONE unit at $82.706, not
  // zero: the source row the owner supplied says so.
  VHY: { rows: 5, units: 23, costBase: 1623.88 },
  FGX: { rows: 9, units: 1109, costBase: 1284.08 },
};

/**
 * Rows the workbook has wrong, corrected against the live source.
 *
 * `docs/AllTradesReport.xlsx` is a STATIC EXPORT. One of its rows has since
 * been corrected at the source, and the export still carries the old value:
 *
 *   VHY | 16 Jul 2026 | Reinvestment | Qty "0" | Price 82.706 | Value "0"
 *
 * The owner's copy of that row reads:
 *
 *   VHY | 16 Jul 2026 | Reinvestment | 1 | AU$82.706 | - | AU$82.71
 *
 * So the workbook says the reinvestment bought nothing and the source says it
 * bought one unit. The source wins, and this table is where that is written
 * down - with the reason - rather than being a silent special case in the
 * parser. Every correction applied is reported by the run harness.
 */
export const CORRECTIONS = [
  {
    code: 'VHY',
    date: '2026-07-16',
    type: 'Reinvestment',
    qty: 1,
    value: 82.71,
    reason:
      'the workbook export predates the source correcting this row from 0 units to 1 unit at $82.706',
  },
];

const correctionFor = (code, date, type) =>
  CORRECTIONS.find(
    (c) => c.code === code && c.date === date && c.type === type,
  );

const sheetRowOf = (row, i) => (Number.isFinite(row.__row) ? row.__row : i + 1);
const ACCEPTED_TYPES = { Buy: 'buy', Reinvestment: 'buy' };

export function parseTrades(rows) {
  const accepted = [];
  const rejected = [];
  const corrections = [];
  const heldCounts = {};
  for (const c of HELD_CODES) heldCounts[c] = { rows: 0 };
  rows.forEach((row, i) => {
    const code = (row.Code ?? '').trim();
    const type = (row.Type ?? '').trim();
    if (!code || !type) return; // banner/header noise
    if (!HELD_CODES.includes(code)) return; // not held: not an error

    const side = ACCEPTED_TYPES[type];
    // Counted before validation: the audit's job is to prove the WORKBOOK was
    // read faithfully, including rows the importer then refuses.
    if (side) heldCounts[code].rows++;
    if (!side) {
      rejected.push({
        row: sheetRowOf(row, i),
        code,
        reason: `unsupported type ${type}`,
      });
      return;
    }
    let quantity = Number(row.Qty);
    const price = Number(row.Price);
    const brokerage =
      row.Brokerage === '' || row.Brokerage == null ? 0 : Number(row.Brokerage);
    const date = (row.Date ?? '').trim();

    // A correction from the live source wins over the static export, and it is
    // applied BEFORE validation - otherwise a row the workbook says is empty
    // would be refused and the correction would never take effect.
    const correction = correctionFor(code, date, type);
    if (correction) {
      corrections.push({
        row: sheetRowOf(row, i),
        code,
        date,
        from: row.Qty,
        to: correction.qty,
        reason: correction.reason,
      });
      quantity = correction.qty;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      rejected.push({
        row: sheetRowOf(row, i),
        code,
        reason: `quantity ${row.Qty} is not a positive number — check whether this DRP bought a fraction`,
      });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      rejected.push({
        row: sheetRowOf(row, i),
        code,
        reason: `price ${row.Price} is not a number`,
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rejected.push({
        row: sheetRowOf(row, i),
        code,
        reason: `date ${row.Date} is not YYYY-MM-DD`,
      });
      return;
    }
    accepted.push({
      code,
      date,
      side,
      quantity,
      price,
      brokerage,
      source: type === 'Reinvestment' ? 'drp' : 'import',
    });
  });
  return { accepted, rejected, heldCounts, corrections };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function summarise(accepted) {
  const out = {};
  for (const code of HELD_CODES) {
    const mine = accepted.filter((r) => r.code === code);
    out[code] = {
      rows: mine.length,
      units: mine.reduce((s, r) => s + r.quantity, 0),
      costBase: round2(
        mine.reduce((s, r) => s + r.quantity * r.price + r.brokerage, 0),
      ),
    };
  }
  return out;
}

/**
 * Audit against the workbook, not against what survived validation. `rows` is
 * every held Buy/Reinvestment row read — including any the importer refused —
 * because the question here is "was the file read faithfully?", and a silently
 * dropped row is exactly the failure worth catching. `units` and `costBase`
 * come from the accepted set, where a refused row contributes nothing anyway.
 */
export function audit(parsed) {
  const accepted = Array.isArray(parsed) ? parsed : parsed.accepted;
  const heldCounts = Array.isArray(parsed)
    ? summarise(parsed)
    : (parsed.heldCounts ?? summarise(parsed.accepted));
  const got = summarise(accepted);
  const checks = [];
  for (const code of HELD_CODES) {
    const want = EXPECTED[code];
    const have = { ...got[code], rows: heldCounts[code].rows };
    for (const key of ['rows', 'units', 'costBase']) {
      checks.push({
        code: `${code}.${key}`,
        detail: `expected ${want[key]}, read ${have[key]}`,
        ok: want[key] === have[key],
      });
    }
  }
  return checks;
}

// --- run harness (only when invoked directly, not on import) --------------
if (process.argv[1] && process.argv[1].endsWith('import-sharesight.mjs')) {
  const path = process.argv[2] ?? 'docs/AllTradesReport.xlsx';
  const rows = readSheet1(readFileSync(path));
  const { accepted, rejected, heldCounts, corrections } = parseTrades(rows);

  console.log(`\nsource: ${path}`);
  console.log(`held codes: ${HELD_CODES.join(', ')}\n`);
  for (const code of HELD_CODES) {
    const s = summarise(accepted)[code];
    console.log(
      `  ${code}  ${String(s.rows).padStart(3)} rows  ${String(s.units).padStart(6)} units  $${s.costBase.toFixed(2)}`,
    );
  }
  if (corrections.length) {
    console.log(
      '\ncorrections applied — the workbook disagrees with the live source:',
    );
    for (const c of corrections)
      console.log(
        `  row ${c.row}  ${c.code} ${c.date}  qty ${c.from} -> ${c.to}  (${c.reason})`,
      );
  }
  if (rejected.length) {
    console.log('\nrejected — the importer does not skip these silently:');
    for (const r of rejected)
      console.log(`  row ${r.row}  ${r.code}  ${r.reason}`);
  }

  const checks = audit({ accepted, heldCounts });
  console.log('');
  for (const c of checks)
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.code}: ${c.detail}`);

  if (checks.some((c) => !c.ok)) {
    console.error(
      '\nRefusing to write: the workbook no longer matches the reconciled figures.',
    );
    process.exit(1);
  }
  console.log(
    "\nRead-only run. Writing to finance.db is Task 4's follow-on; run scripts/db-target.mjs to pick a database.\n",
  );
}
