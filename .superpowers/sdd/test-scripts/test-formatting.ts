// Unit test script for formatting.ts — run with: npx tsx test-formatting.ts
import { formatCell } from '../../../hub/components/spreadsheet/formatting';
import type { Cell } from '../../../hub/components/spreadsheet/types';

let pass = 0, fail = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`); fail++; }
}

console.log('\n── null/empty ────────────────────────────────');
assert('null cell', formatCell(null), { text: '', defaultAlign: 'left' });
assert('null value', formatCell({ v: null }), { text: '', defaultAlign: 'left' });

console.log('\n── strings ───────────────────────────────────');
assert('plain string', formatCell({ v: 'hello' }), { text: 'hello', defaultAlign: 'left' });
assert('empty string', formatCell({ v: '' }), { text: '', defaultAlign: 'left' });

console.log('\n── numbers ───────────────────────────────────');
assert('integer no fmt', formatCell({ v: 42 }), { text: '42', defaultAlign: 'right' });
assert('float no fmt', formatCell({ v: 3.14 }), { text: '3.14', defaultAlign: 'right' });
assert('number with #,##0.00', formatCell({ v: 1234.5, s: { numFmt: '#,##0.00' } }), { text: '1,234.50', defaultAlign: 'right' });
assert('percent 0.00%', formatCell({ v: 0.1234, s: { numFmt: '0.00%' } }), { text: '12.34%', defaultAlign: 'right' });

console.log('\n── booleans ──────────────────────────────────');
assert('true', formatCell({ v: true }), { text: 'TRUE', defaultAlign: 'center' });
assert('false', formatCell({ v: false }), { text: 'FALSE', defaultAlign: 'center' });

console.log('\n── computedValue override ────────────────────');
const formulaCell: Cell = { v: 0, f: 'SUM(A1:A3)' };
assert('computed value used', formatCell(formulaCell, 42), { text: '42', defaultAlign: 'right' });

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
