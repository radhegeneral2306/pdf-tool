import { describe, expect, it } from 'vitest';
import { dateName, defaultExportName, finalFileName, nextAvailable, sanitizeName } from '../src/lib/fileName';

const d = new Date(2026, 8, 7); // 7 Sep 2026

describe('file names', () => {
  it('formats today as DD-MM-YY', () => {
    expect(dateName(d)).toBe('07-09-26');
  });
  it('strips characters files cannot contain and a trailing .pdf', () => {
    expect(sanitizeName(' Bill 12/09/26: final?.PDF ')).toBe('Bill 120926 final');
    expect(sanitizeName('a<b>c|d*e"f\\g')).toBe('abcdefg');
    expect(sanitizeName('...hidden')).toBe('hidden');
  });
  it('adds (2), (3) when the name was already used', () => {
    expect(nextAvailable('07-09-26', [])).toBe('07-09-26');
    expect(nextAvailable('07-09-26', ['07-09-26'])).toBe('07-09-26 (2)');
    expect(nextAvailable('07-09-26', ['07-09-26', '07-09-26 (2)'])).toBe('07-09-26 (3)');
    expect(defaultExportName(['07-09-26'], d)).toBe('07-09-26 (2)');
  });
  it('falls back to the date when the typed name is empty', () => {
    expect(finalFileName('   ', [], d)).toBe('07-09-26.pdf');
    expect(finalFileName('Rent receipt', [], d)).toBe('Rent receipt.pdf');
  });
});
