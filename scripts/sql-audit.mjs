// Shared by scripts/apply-seed.mjs and tests/seed-sql.test.ts so the two cannot
// drift: this turns the seed SQL's audit block into statements SQLite can
// prepare.
//
// Why not `auditSql.split(';')`: the audit block is introduced by comment
// headers, and one of them contains a semicolon inside the comment
// ("Run after importing; the last one must return zero rows."). Splitting on
// ';' first cuts that comment in half, so its second half -- plain prose, not
// prefixed with '--' -- survives as the head of the next "statement" and SQLite
// fails with `near "the": syntax error`. A naive "strip leading comment lines"
// pass does not help either, because blank lines between comment blocks stop it
// before it reaches the SQL.
//
// So: consume the file line by line, drop comment-only lines, and end a
// statement at the first line that ends with ';'. A run of comment lines
// directly above a statement is that statement's label, joined into one line;
// a blank line ends the run, so a section header is not mistaken for the label
// of the first query under it.
//
// Assumes one statement per ';' and '--' comments on their own lines, which is
// what src/seed/wealth-seed.sql contains.
export function splitAuditStatements(auditSql) {
  const statements = [];
  let pending = [];
  let buffer = [];

  const flush = () => {
    const sql = buffer.join('\n').trim();
    if (sql !== '') {
      statements.push({ label: pending.join(' ').trim(), sql });
    }
    buffer = [];
    pending = [];
  };

  for (const line of auditSql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      pending = []; // blank line ends a comment run
      continue;
    }
    if (trimmed.startsWith('--')) {
      // Never reaches the buffer, so a ';' inside a comment cannot split a
      // statement in half.
      pending.push(trimmed.replace(/^--\s*/, ''));
      continue;
    }
    buffer.push(line);
    if (trimmed.endsWith(';')) flush();
  }
  flush(); // a trailing statement with no ';'
  return statements;
}

/** True for the audit statements that must return no rows. */
export function isConsistencyCheck(sql) {
  return /finance_year <>|NOT IN/.test(sql);
}
