import { inflateRawSync } from 'node:zlib';

/**
 * Minimal, dependency-free reader for the two XML parts an .xlsx needs.
 * An xlsx is a ZIP: locate the End Of Central Directory record, walk the
 * central directory for the entries we want, then inflate each one.
 *
 * Plain .mjs on purpose - the repo's other scripts (apply-seed.mjs,
 * db-target.mjs) are plain JS, and this must run under a bare `node` before
 * any build tooling exists.
 */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function findEocd(buf) {
  // The EOCD is the last 22 bytes plus a comment of up to 65535.
  const start = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('not an xlsx: no end-of-central-directory record');
}

function readEntries(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CEN_SIG) break;
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    // Re-read the local header: its name/extra lengths can differ from the
    // central directory's, so the payload offset must come from here.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));

    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Shared strings may be split across several <r><t> runs; taking only the
 * first <t> silently truncates them.
 */
function parseSharedStrings(xml) {
  const out = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? []) {
    let text = '';
    for (const t of si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []) {
      text += unescapeXml(t.replace(/<t[^>]*>/, '').replace(/<\/t>/, ''));
    }
    out.push(text);
  }
  return out;
}

const colOf = (ref) => ref.replace(/\d+/g, '');

/**
 * Read sheet 1 keyed by the header row's own labels, so callers never hardcode
 * "Date is column D". Rows before the header (the report banner) come back
 * keyed by column letter instead, since no header exists to name them.
 */
export function readSheet1(buffer) {
  const entries = readEntries(buffer);
  const sharedRaw = entries.get('xl/sharedStrings.xml');
  const sheetRaw = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetRaw) throw new Error('xlsx has no xl/worksheets/sheet1.xml');
  const shared = sharedRaw
    ? parseSharedStrings(sharedRaw.toString('utf8'))
    : [];

  const raw = [];
  const sheet = sheetRaw.toString('utf8');
  for (const rowXml of sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    // The spreadsheet's own row number, so a caller can point a human at the
    // exact row. Array position is not it: empty rows are not emitted.
    const sheetRow = Number(/<row\b[^>]*\br="(\d+)"/.exec(rowXml)?.[1] ?? 0);
    const row = { __row: sheetRow };
    for (const cell of rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ??
      []) {
      const ref = /r="([A-Z]+\d+)"/.exec(cell)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(cell)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
      if (v === undefined) continue;
      row[colOf(ref)] =
        type === 's' ? (shared[Number(v)] ?? '') : unescapeXml(v);
    }
    if (Object.keys(row).length) raw.push(row);
  }

  const headerIdx = raw.findIndex((r) => r.A === 'Code');
  if (headerIdx === -1) throw new Error('sheet1 has no "Code" header row');
  const names = raw[headerIdx];
  const letters = Object.keys(names);

  return raw.map((row, i) => {
    if (i < headerIdx) return { ...row };
    const out = { __row: row.__row };
    for (const letter of letters) {
      if (names[letter] === '' || row[letter] === undefined) continue;
      out[names[letter]] = row[letter];
    }
    return out;
  });
}
