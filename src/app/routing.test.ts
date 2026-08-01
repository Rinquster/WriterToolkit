import { describe, expect, it } from 'vitest';
import { normalizeBase } from './routing';

describe('normalizeBase', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/WriterToolkit/', '/WriterToolkit'],
    ['WriterToolkit/', '/WriterToolkit'],
    ['//nested/path//', '/nested/path'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeBase(input)).toBe(expected);
  });
});
