// Unit test script for clipboard.ts — run with: npx tsx .superpowers/sdd/test-scripts/test-clipboard.ts
import { rangeToCsv, parseTsv, rangeToHtml } from '../../../hub/components/spreadsheet/clipboard';
import type { SheetModel } from '../../../hub/components/spreadsheet/types';

let pass = 0, fail = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`); fail++; }
}
function assertContains(label: string, actual: string, substring: string) {
  const ok = actual.includes(substring);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     "${substring}" not found in:\n     ${actual}`); fail++; }
}

const sheet: SheetModel = {
  name: 'Sheet1',
  colWidths: [],
  rowHeights: [],
  merges: [],
  cells: [
    [{ v: 'Name' }, { v: 'Score' }, { v: 'Pass' }],
    [{ v: 'Alice' }, { v: 95, s: { numFmt: '#,##0.00' } }, { v: true }],
    [{ v: 'Bob' }, { v: 3.14 }, { v: false }],
  ],
};

console.log('\n── rangeToCsv ────────────────────────────────');
const tsv = rangeToCsv(sheet, 0, 0, 2, 2);
assert('first row first col', tsv.split('\n')[0].split('\t')[0], 'Name');
assert('first row second col', tsv.split('\n')[0].split('\t')[1], 'Score');
assert('number formatted', tsv.split('\n')[1].split('\t')[1], '95.00');
assert('boolean TRUE', tsv.split('\n')[1].split('\t')[2], 'TRUE');
assert('boolean FALSE', tsv.split('\n')[2].split('\t')[2], 'FALSE');
assert('row count', tsv.split('\n').length, 3);
assert('col count row 0', tsv.split('\n')[0].split('\t').length, 3);

console.log('\n── parseTsv ──────────────────────────────────');
const raw = 'a\tb\tc\n1\t2\t3';
const parsed = parseTsv(raw);
assert('row count', parsed.length, 2);
assert('col count', parsed[0].length, 3);
assert('cell [0][0]', parsed[0][0], 'a');
assert('cell [1][2]', parsed[1][2], '3');

// CRLF normalisation (from Windows Excel)
const crlf = 'x\ty\r\n1\t2\r\n';
const parsedCrlf = parseTsv(crlf);
assert('crlf: row count', parsedCrlf.length, 2);
assert('crlf: cell [0][0]', parsedCrlf[0][0], 'x');
assert('crlf: cell [1][1]', parsedCrlf[1][1], '2');

// round-trip: tsv → parse → compare
const roundTrip = parseTsv(rangeToCsv(sheet, 0, 0, 2, 2));
assert('round-trip rows', roundTrip.length, 3);
assert('round-trip cols', roundTrip[0].length, 3);
assert('round-trip [0][0]', roundTrip[0][0], 'Name');

console.log('\n── rangeToHtml ───────────────────────────────');
const html = rangeToHtml(sheet, 0, 0, 1, 1);
assertContains('has <table>', html, '<table>');
assertContains('has <tr>', html, '<tr>');
assertContains('has <td>', html, '<td style=');
assertContains('Name in html', html, 'Name');
assertContains('Score in html', html, 'Score');
assertContains('95.00 in html', html, '95.00');

// XSS escaping
const xssSheet: SheetModel = { ...sheet, cells: [[{ v: '<script>alert(1)</script>' }]] };
const xssHtml = rangeToHtml(xssSheet, 0, 0, 0, 0);
assert('XSS < escaped', xssHtml.includes('<script>'), false);
assertContains('XSS &lt; present', xssHtml, '&lt;script&gt;');

// Bold style propagated
const styledSheet: SheetModel = { ...sheet, cells: [[{ v: 'Bold', s: { bold: true } }]] };
const styledHtml = rangeToHtml(styledSheet, 0, 0, 0, 0);
assertContains('bold style in html', styledHtml, 'font-weight:bold');

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
