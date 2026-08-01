import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Clock, IdProvider, LegacySceneDocument } from './model';
import {
  fromLegacy,
  nameFromFilename,
  parseLegacyJson,
  projectDocument,
  projectLegacy,
  toLegacy,
} from './legacy';

class SequenceIds implements IdProvider {
  private next = 0;

  nextId(): string {
    this.next += 1;
    return `id-${this.next}`;
  }
}

const fixedClock: Clock = { now: () => '2026-08-01T09:00:00.000Z' };

const richFixture: LegacySceneDocument = [
  {
    id: 40,
    title: '',
    activeVariant: 20,
    variants: [
      { id: 10, text: '  Ведущий пробел\r\nи CRLF\t' },
      { id: 20, text: '«Ёж» 👩🏽‍💻 é\n\nПоследняя строка  ' },
      { id: 90, text: '' },
    ],
  },
  {
    id: 40,
    title: 'Не сцена 2',
    activeVariant: -7,
    variants: [
      { id: -7, text: 'Одинаковый текст' },
      { id: 4.5, text: 'Одинаковый текст' },
    ],
  },
];

describe('legacy import and export', () => {
  it('preserves the complete content projection while regenerating IDs', () => {
    const imported = fromLegacy(richFixture, {
      name: 'Совместимость',
      ids: new SequenceIds(),
      clock: fixedClock,
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.value.report).toMatchObject({ sceneCount: 2, variantCount: 5 });
    expect(imported.value.report.warnings).toHaveLength(1);
    expect(imported.value.document.scenes[0]?.id).not.toBe('40');
    expect(projectDocument(imported.value.document)).toEqual(
      projectLegacy(richFixture),
    );

    const exported = toLegacy(imported.value.document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    expect(projectLegacy(exported.value)).toEqual(projectLegacy(richFixture));
    expect(exported.value.map((scene) => scene.id)).toEqual([1, 2]);
    expect(exported.value[0]?.variants.map((variant) => variant.id)).toEqual([1, 2, 3]);
    expect(exported.value[0]?.activeVariant).toBe(2);
  });

  it('reports invalid JSON without leaking input text into diagnostics', () => {
    const secret = 'СЕКРЕТНЫЙ ТЕКСТ';
    const parsed = parseLegacyJson(`[{ "text": "${secret}" }`, {
      ids: new SequenceIds(),
      clock: fixedClock,
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.diagnostics).toHaveLength(1);
    expect(JSON.stringify(parsed.error.diagnostics)).not.toContain(secret);
  });

  it.each([
    ['object root', {}, 'invalid-root'],
    ['empty root', [], 'empty-document'],
    [
      'missing active variant',
      [{ id: 1, title: 'A', activeVariant: 3, variants: [{ id: 1, text: '' }] }],
      'active-variant-not-found',
    ],
    [
      'duplicate variant ID',
      [
        {
          id: 1,
          title: 'A',
          activeVariant: 1,
          variants: [
            { id: 1, text: 'a' },
            { id: 1, text: 'b' },
          ],
        },
      ],
      'duplicate-variant-id',
    ],
    [
      'non-string text',
      [{ id: 1, title: 'A', activeVariant: 1, variants: [{ id: 1, text: null }] }],
      'invalid-variant-text',
    ],
  ])('rejects %s atomically', (_label, value, expectedCode) => {
    const imported = fromLegacy(value, { ids: new SequenceIds(), clock: fixedClock });
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error.diagnostics.map((issue) => issue.code)).toContain(
      expectedCode,
    );
  });

  it('derives a readable document name without changing the file itself', () => {
    expect(nameFromFilename('chapter19.JSON')).toBe('chapter19');
    expect(nameFromFilename('.json')).toBe('Импортированный документ');
    expect(nameFromFilename('draft.backup.json')).toBe('draft.backup');
  });
});

const privateFixturePaths = [
  'old_frozen/example.json',
  'old_frozen/json/chapter19.json',
  'old_frozen/json/schoons.json',
]
  .map((path) => resolve(process.cwd(), path))
  .filter(existsSync);

describe.skipIf(privateFixturePaths.length === 0)(
  'private legacy compatibility fixtures',
  () => {
    it.each(privateFixturePaths)('round-trips %s by content projection', (path) => {
      const legacy = JSON.parse(readFileSync(path, 'utf8')) as LegacySceneDocument;
      const imported = fromLegacy(legacy, {
        ids: new SequenceIds(),
        clock: fixedClock,
      });
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;

      const exported = toLegacy(imported.value.document);
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;

      expect(projectLegacy(exported.value)).toEqual(projectLegacy(legacy));
    });
  },
);
