import { describe, expect, it } from 'vitest';
import { friendlyOcrError, joinPages, ocrFileName, shouldWarn, wordCount } from '../src/lib/ocrText';

describe('OCR text helpers', () => {
  it('returns plain text for a single page', () => {
    expect(joinPages([{ page: 1, label: 'a.jpg', text: '  Hello world \n' }])).toBe('Hello world');
  });
  it('adds a separator before every page when there are several', () => {
    const t = joinPages([
      { page: 1, label: 'bill.pdf, page 1', text: 'One' },
      { page: 2, label: 'bill.pdf, page 2', text: '', error: 'OCR failed on this page.' },
    ]);
    expect(t).toBe('——— Page 1 (bill.pdf, page 1) ———\nOne\n\n——— Page 2 (bill.pdf, page 2) ———\n[Could not read this page: OCR failed on this page.]');
  });
  it('counts words without the separators', () => {
    expect(wordCount('——— Page 1 (x) ———\nHello  big world\n\n——— Page 2 (x) ———\nनमस्ते दुनिया')).toBe(5);
    expect(wordCount('   ')).toBe(0);
  });
  it('warns above 20 pages only', () => {
    expect(shouldWarn(20)).toBe(false);
    expect(shouldWarn(21)).toBe(true);
  });
  it('names files with the date', () => {
    expect(ocrFileName('txt', new Date(2026, 8, 27))).toBe('OCR 27-09-26.txt');
  });
  it('explains common failures in plain words', () => {
    expect(friendlyOcrError(new RangeError('Array buffer allocation failed'))).toMatch(/memory/);
    expect(friendlyOcrError(new Error('Failed to fetch'))).toMatch(/internet/);
    expect(friendlyOcrError(new Error('weird'))).toBe('OCR failed on this page.');
  });
});
