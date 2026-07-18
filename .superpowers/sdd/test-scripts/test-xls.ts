// .xls (BIFF8) round-trip: dates, number formats, merges, widths survive save+load
import { saveWorkbook, loadWorkbook } from '../../../hub/components/spreadsheet/excel-io';
import { parseInputToValue, editTextForValue, formatCell } from '../../../hub/components/spreadsheet/formatting';
import type { WorkbookModel } from '../../../hub/components/spreadsheet/types';

let pass = 0, fail = 0;
function assert(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  FAIL ${name}: got ${a}, want ${e}`); }
}

async function main() {
  const model: WorkbookModel = {
    sheets: [{
      name: 'Att',
      cells: [
        [{ v: 'Date', s: { bold: true } }, { v: 'In' }, { v: 'Spent' }],
        [
          { v: new Date(2022, 2, 25), s: { numFmt: 'dd/mm/yy' } },
          { v: 0.70659722, s: { numFmt: 'hh:mm:ss' } },
          { v: 123.5 },
        ],
      ],
      colWidths: [80, 64, 64],
      rowHeights: [null, null],
      merges: [{ r1: 0, c1: 1, r2: 0, c2: 2 }],
    }],
  };

  const b64 = await saveWorkbook(model, '.xls');
  // BIFF8 magic: D0 CF 11 E0 (OLE compound file), not PK zip
  const head = atob(b64).slice(0, 4).split('').map((c) => c.charCodeAt(0).toString(16));
  assert('xls magic is OLE not zip', head, ['d0', 'cf', '11', 'e0']);

  const loaded = await loadWorkbook(b64, '.xls');
  const sh = loaded.sheets[0];
  const dateCell = sh.cells[1]?.[0];
  assert('date survives as Date', dateCell?.v instanceof Date, true);
  const d = dateCell?.v as Date;
  assert('date value', [d.getFullYear(), d.getMonth(), d.getDate()], [2022, 2, 25]);
  assert('date numFmt survives', dateCell?.s?.numFmt?.toLowerCase(), 'dd/mm/yy');
  const timeCell = sh.cells[1]?.[1];
  assert('time numFmt survives', timeCell?.s?.numFmt?.toLowerCase(), 'hh:mm:ss');
  assert('plain number survives', sh.cells[1]?.[2]?.v, 123.5);
  assert('merge survives', sh.merges[0], { r1: 0, c1: 1, r2: 0, c2: 2 });
  assert('display of date', formatCell(dateCell!).text, '25/03/22');

  // input parsing helpers
  const t = parseInputToValue('16:57:30');
  assert('time input → fraction', Math.abs((t as number) - (16 / 24 + 57 / 1440 + 30 / 86400)) < 1e-9, true);
  const pd = parseInputToValue('25/03/22', 'dd/mm/yy') as Date;
  assert('date input d/m/y', [pd.getFullYear(), pd.getMonth(), pd.getDate()], [2022, 2, 25]);
  const pd2 = parseInputToValue('03/25/22', 'm/d/yyyy') as Date;
  assert('date input m/d/y', [pd2.getFullYear(), pd2.getMonth(), pd2.getDate()], [2022, 2, 25]);
  assert('number input', parseInputToValue('42'), 42);
  assert('string input stays string', parseInputToValue('hello'), 'hello');
  assert('edit text for date', editTextForValue(new Date(2022, 2, 25), 'dd/mm/yy'), '25/03/22');

  console.log('─'.repeat(50));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main();
