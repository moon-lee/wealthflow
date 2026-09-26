// Shared by scripts/apply-seed.mjs and tests/seed-sql.test.ts so the two cannot
// drift: this is the logic that splits the seed SQL's audit block into
// statements SQLite can prepare.
//
// Splitting on ';' alone is not enough. The audit block is introduced by a
// comment header, and a naive split leaves those comment lines glued to the
// front of the first statement, so SQLite reads the first word of a comment as
// SQL and fails with something like `near "the": syntax error`. Blank lines
// between comment blocks make that worse, because they stop a naive
// "strip leading comments" loop before it reaches the statement.
//
// Assumes one statement per ';' and '--' comments on their own lines, which is
// what src/seed/wealth-seed.sql contains.
export function splitAuditStatements(auditSql) {
  return auditSql
    .split(';')
    .map((chunk) => {
      const comments = [];
      const body = [];
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (t === '') continue; // blank lines carry no SQL
        if (t.startsWith('--')) {
          comments.push(t.replace(/^--\s*/, ''));
          continue;
        }
        body.push(line);
      }
      return { label: comments.join(' ').trim(), sql: body.join('\n').trim() };
    })
    .filter((s) => s.sql !== '');
}

/** True for the audit statements that must return no rows. */
export function isConsistencyCheck(sql) {
  return /finance_year <>|NOT IN/.test(sql);
}
