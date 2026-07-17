// Unit test script for coords.ts — run with: npx tsx test-coords.ts
import { colLetter, parseA1, toA1, parseRange, normalizeRange, buildCoveredSet, inRange } from '../../../hub/components/spreadsheet/coords';

let pass = 0, fail = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`); fail++; }
}

console.log('\n── colLetter ─────────────────────────────────');
assert('0 → A',  colLetter(0),  'A');
assert('25 → Z', colLetter(25), 'Z');
assert('26 → AA', colLetter(26), 'AA');
assert('27 → AB', colLetter(27), 'AB');
assert('701 → ZZ', colLetter(701), 'ZZ');
assert('702 → AAA', colLetter(702), 'AAA');

console.log('\n── parseA1 ───────────────────────────────────');
assert('A1 → {r:0,c:0}', parseA1('A1'), { r: 0, c: 0 });
assert('B2 → {r:1,c:1}', parseA1('B2'), { r: 1, c: 1 });
assert('Z26 → {r:25,c:25}', parseA1('Z26'), { r: 25, c: 25 });
assert('AA1 → {r:0,c:26}', parseA1('AA1'), { r: 0, c: 26 });
assert('invalid → null', parseA1('123'), null);

console.log('\n── toA1 ──────────────────────────────────────');
assert('0,0 → A1', toA1(0, 0), 'A1');
assert('25,25 → Z26', toA1(25, 25), 'Z26');
assert('0,26 → AA1', toA1(0, 26), 'AA1');

console.log('\n── round-trip ────────────────────────────────');
for (const [r, c] of [[0,0],[5,10],[99,51],[0,702]]) {
  const a1 = toA1(r as number, c as number);
  const parsed = parseA1(a1);
  assert(`toA1(${r},${c}) round-trips via ${a1}`, parsed, { r, c });
}

console.log('\n── parseRange ────────────────────────────────');
assert('A1 → single cell', parseRange('A1'), { r1:0,c1:0,r2:0,c2:0 });
assert('A1:B3', parseRange('A1:B3'), { r1:0,c1:0,r2:2,c2:1 });
assert('invalid → null', parseRange('foo'), null);

console.log('\n── normalizeRange ────────────────────────────');
assert('already normal', normalizeRange({r1:0,c1:0,r2:2,c2:3}), {r1:0,c1:0,r2:2,c2:3});
assert('inverted', normalizeRange({r1:3,c1:4,r2:1,c2:2}), {r1:1,c1:2,r2:3,c2:4});

console.log('\n── buildCoveredSet ───────────────────────────');
const covered = buildCoveredSet([{ r1:0,c1:0,r2:1,c2:1 }]);
assert('0,0 not covered (top-left)', covered.has('0,0'), false);
assert('0,1 covered', covered.has('0,1'), true);
assert('1,0 covered', covered.has('1,0'), true);
assert('1,1 covered', covered.has('1,1'), true);
assert('2,0 not covered', covered.has('2,0'), false);

console.log('\n── inRange ───────────────────────────────────');
assert('inside', inRange(1,1,{r1:0,c1:0,r2:2,c2:2}), true);
assert('outside', inRange(3,3,{r1:0,c1:0,r2:2,c2:2}), false);
assert('edge', inRange(2,2,{r1:0,c1:0,r2:2,c2:2}), true);

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
