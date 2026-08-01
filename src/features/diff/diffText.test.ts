import { describe, expect, it } from 'vitest';
import { compareText } from './diffText';

describe('compareText', () => {
  it('preserves whitespace while highlighting word-level changes', () => {
    const result = compareText('Он  пришёл.\n', 'Он ушёл.\n', {
      mode: 'words',
      ignoreCase: false,
    });

    expect(result.timedOut).toBe(false);
    expect(result.changes.map((change) => change.value).join('')).toContain('Он');
    expect(
      result.changes
        .filter((change) => !change.added)
        .map((change) => change.value)
        .join(''),
    ).toBe('Он  пришёл.\n');
    expect(
      result.changes
        .filter((change) => !change.removed)
        .map((change) => change.value)
        .join(''),
    ).toBe('Он ушёл.\n');
    expect(result.addedCharacters).toBeGreaterThan(0);
    expect(result.removedCharacters).toBeGreaterThan(0);
  });

  it('can compare line structure and ignore letter case', () => {
    const exact = compareText('Строка\nВторая', 'строка\nТретья', {
      mode: 'lines',
      ignoreCase: true,
    });

    expect(exact.changes[0]).toMatchObject({
      value: 'строка\n',
      added: false,
      removed: false,
    });
    expect(exact.changes.some((change) => change.removed)).toBe(true);
    expect(exact.changes.some((change) => change.added)).toBe(true);
  });

  it('returns one unchanged part for identical text', () => {
    const result = compareText('одинаково', 'одинаково', {
      mode: 'words',
      ignoreCase: false,
    });
    expect(result.changes).toEqual([
      { count: 9, value: 'одинаково', added: false, removed: false },
    ]);
  });
});
