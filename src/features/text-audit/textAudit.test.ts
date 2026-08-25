import { describe, expect, it } from 'vitest';
import {
  analyzeText,
  buildHighlightPlan,
  findMatches,
  parseFillerWords,
  MAX_HIGHLIGHT_LENGTH,
  MAX_SEARCH_MATCHES,
  type AnomalyKind,
  type CharCategory,
  type TextRange,
} from './textAudit';

function ranges(text: string, kind: AnomalyKind): string[] {
  return analyzeText(text).anomalies[kind].map((range) =>
    text.slice(range.start, range.end),
  );
}

function highlight(
  text: string,
  categories: CharCategory[] = [],
  anomalies: AnomalyKind[] = [],
  search: TextRange[] = [],
): string[] {
  const plan = buildHighlightPlan(text, {
    analysis: analyzeText(text),
    categories,
    anomalies,
    search,
  });
  return plan.runs.map(
    (run) => `${run.layer ?? '-'}:${text.slice(run.start, run.end)}`,
  );
}

describe('analyzeText', () => {
  it('counts code points by script, punctuation, digits and the rest', () => {
    const analysis = analyzeText('Да, yes 42 — ✓');

    expect(analysis.stats).toEqual({
      cyrillic: 2,
      latin: 3,
      punctuation: 2,
      digit: 2,
      whitespace: 4,
      other: 1,
    });
    expect(analysis.characters).toBe(14);
    expect(analysis.words).toBe(3);
  });

  it('counts astral code points once and keeps the category map aligned', () => {
    const analysis = analyzeText('а😺');

    expect(analysis.characters).toBe(2);
    expect(analysis.stats.other).toBe(1);
    expect(analysis.categories.length).toBe(3);
    expect([...analysis.categories]).toEqual([0, 5, 5]);
  });

  it('finds words that mix Cyrillic and Latin letters', () => {
    // Вторая «o» — латинская.
    expect(ranges('кошка и кoшка', 'mixedScript')).toEqual(['кoшка']);
  });

  it('ignores hyphenated compounds built from two single-script parts', () => {
    expect(ranges('IT-специалист пришёл', 'mixedScript')).toEqual([]);
  });

  it('reports repeated spaces except a deliberate line indent', () => {
    expect(ranges('    Отступ, но  здесь  лишние', 'extraSpace')).toEqual(['  ', '  ']);
  });

  it('separates trailing spaces and spaces before punctuation', () => {
    expect(ranges('Строка  \nВопрос ?', 'trailingSpace')).toEqual(['  ']);
    expect(ranges('Вопрос ?', 'spaceBeforePunctuation')).toEqual([' ']);
  });

  it('exposes invisible characters and typographic slips', () => {
    expect(ranges('нераз рывный​ноль', 'invisible')).toEqual([' ', '​']);
    expect(ranges('Он - тот, "кто" ждал... точно', 'typography')).toEqual([
      '-',
      '"',
      '"',
      '...',
    ]);
  });

  it('detects a word repeated on the same line but not across lines', () => {
    expect(ranges('что что было', 'repeatedWord')).toEqual(['что что']);
    expect(ranges('Что\nчто было', 'repeatedWord')).toEqual([]);
  });

  it('matches filler words and multi-word filler phrases case-insensitively', () => {
    expect(ranges('Он Просто шёл, как бы не спеша', 'fillerWord')).toEqual([
      'Просто',
      'как бы',
    ]);
    expect(analyzeText('очень просто', ['практически']).anomalies.fillerWord).toEqual(
      [],
    );
  });

  it('treats ё and е as the same letter in the filler list', () => {
    expect(ranges('всё-таки пришёл', 'fillerWord')).toEqual(['всё-таки']);
  });
});

describe('findMatches', () => {
  const options = { useRegex: false, caseSensitive: false };

  it('finds a plain substring and treats regex metacharacters literally', () => {
    expect(findMatches('a.b axb', 'a.b', options).ranges).toEqual([
      { start: 0, end: 3 },
    ]);
  });

  it('respects the case-sensitivity switch', () => {
    expect(findMatches('Дом дом', 'дом', options).ranges).toHaveLength(2);
    expect(
      findMatches('Дом дом', 'дом', { ...options, caseSensitive: true }).ranges,
    ).toHaveLength(1);
  });

  it('supports Unicode property escapes in regex mode', () => {
    const outcome = findMatches('abc абв', '\\p{Script=Cyrillic}+', {
      ...options,
      useRegex: true,
    });
    expect(outcome.ranges).toEqual([{ start: 4, end: 7 }]);
  });

  it('terminates on a zero-length regex instead of looping forever', () => {
    const outcome = findMatches('текст', 'a*', { ...options, useRegex: true });
    expect(outcome.ranges).toEqual([]);
    expect(outcome.error).toBeUndefined();
  });

  it('reports a broken pattern without throwing', () => {
    const outcome = findMatches('текст', '(', { ...options, useRegex: true });
    expect(outcome.ranges).toEqual([]);
    expect(outcome.error).toBeTruthy();
  });

  it('caps the number of reported matches', () => {
    const outcome = findMatches('a'.repeat(MAX_SEARCH_MATCHES + 10), 'a', options);
    expect(outcome.ranges).toHaveLength(MAX_SEARCH_MATCHES);
    expect(outcome.truncated).toBe(true);
  });
});

describe('buildHighlightPlan', () => {
  it('merges neighbouring characters of one category into a single run', () => {
    expect(highlight('да yes', ['cyrillic'])).toEqual(['cyrillic:да', '-: yes']);
  });

  it('lets anomalies win over categories and search win over anomalies', () => {
    expect(highlight('a  b', ['whitespace'], ['extraSpace'])).toEqual([
      '-:a',
      'extraSpace:  ',
      '-:b',
    ]);
    expect(
      highlight('a  b', ['whitespace'], ['extraSpace'], [{ start: 1, end: 3 }]),
    ).toEqual(['-:a', 'search:  ', '-:b']);
  });

  it('covers the whole text exactly once', () => {
    const text = 'Слово word, 12 — «да»';
    const plan = buildHighlightPlan(text, {
      analysis: analyzeText(text),
      categories: ['cyrillic', 'latin', 'punctuation', 'digit'],
      anomalies: ['fillerWord'],
      search: [],
    });

    expect(plan.runs.map((run) => text.slice(run.start, run.end)).join('')).toBe(text);
    expect(plan.runs[0]?.start).toBe(0);
    expect(plan.runs.at(-1)?.end).toBe(text.length);
  });

  it('skips highlighting above the size limit but keeps the counters usable', () => {
    const text = 'я'.repeat(MAX_HIGHLIGHT_LENGTH + 1);
    const analysis = analyzeText(text);

    expect(analysis.stats.cyrillic).toBe(MAX_HIGHLIGHT_LENGTH + 1);
    expect(
      buildHighlightPlan(text, {
        analysis,
        categories: ['cyrillic'],
        anomalies: [],
        search: [],
      }).runs,
    ).toEqual([]);
  });
});

describe('parseFillerWords', () => {
  it('splits by newlines, commas and semicolons and normalizes the entries', () => {
    expect(parseFillerWords(' Очень,\nкак бы;\n\n ')).toEqual(['очень', 'как бы']);
  });
});
