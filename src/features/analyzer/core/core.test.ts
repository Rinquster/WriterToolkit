import { describe, expect, it } from 'vitest';
import {
  applySquareBrackets,
  countCodePoints,
  hitsReport,
  lineNoForOffset,
  lineStarts,
  splitLinesKeepEnds,
} from './text';
import { cleanBasenameFor, cleanTextLegacy, htmlToText } from './htmlToText';
import {
  computeInstruction,
  looksLikePythonRegex,
  translatePythonRegex,
} from './instructions';
import {
  defaultConfig,
  instructionKey,
  normalizeConfig,
  parseConfigText,
  serializeConfig,
} from './config';
import { presetByKey } from './presets';
import { barScale, perThousand, tickPx } from './bars';
import { formatNumber, rowsToTsv, safeName } from './tsv';

describe('text', () => {
  it('режет строки как Python splitlines и нумерует по смещениям', () => {
    expect(splitLinesKeepEnds('a\r\nb\nc')).toEqual(['a\r\n', 'b\n', 'c']);
    const starts = lineStarts('ab\ncd\nef');
    expect(starts).toEqual([0, 3, 6]);
    expect(lineNoForOffset(starts, 4)).toBe(2);
    expect(countCodePoints('a😀b')).toBe(3);
  });

  it('строит hits- и full-отчёты в формате aio_v2', () => {
    const text = '=== Глава ===\n\nОн шёл — и думал.\nРеплика.\n';
    const dash = presetByKey('dash');
    const { hits } = computeInstruction('regex', text, dash!.params);
    expect(hitsReport(['Файл: x'], hits)).toBe(
      'Файл: x\n\n--- 1. regex, строки 3 ---\nПричина: совпадение поискового запроса\nОн шёл — и думал.\n',
    );
    expect(applySquareBrackets(text, hits)).toBe(
      '=== Глава ===\n\n[Он шёл — и думал.]\nРеплика.\n',
    );
  });
});

describe('htmlToText', () => {
  it('переводит заголовки, пустые абзацы и сущности', () => {
    const html =
      '<h2 class="chapter-title">Глава 1</h2><div class="chapter-publish-date">01.01.2025</div><p>Раз &mdash; два&nbsp;три&#33;</p><p><br></p><p>Четыре.</p>';
    expect(htmlToText(html)).toBe('=== Глава 1 ===\n\nРаз — два три!\n\nЧетыре.');
  });

  it('не гасит документ из-за <meta> и не пропускает текст из игнорируемого блока', () => {
    expect(
      htmlToText(
        '<html><head><meta charset="utf-8"><title>T</title></head><body><p>Текст.</p></body></html>',
      ),
    ).toBe('Текст.');
    expect(
      htmlToText('<div class="date"><span>12.05</span> ещё дата</div><p>Тело.</p>'),
    ).toBe('Тело.');
    expect(
      htmlToText(
        '<p>А</p><script>var x = "<p>нет</p>";</script><!-- <p>нет</p> --><p>Б</p>',
      ),
    ).toBe('А\nБ');
  });

  it('legacy-очистка и имена', () => {
    expect(cleanTextLegacy('a  \n\nb\n\n\n\nc\n')).toBe('a\nb\n\nc');
    expect(cleanBasenameFor('01.HTML')).toBe('01.txt');
  });
});

describe('instructions', () => {
  it('символы после первых двух строк, CRLF за два знака', () => {
    expect(computeInstruction('chars', '=== Г ===\r\n\r\nабв\r\n', {}).value).toBe(5);
  });

  it('регулярка: ошибки, единицы, регистр', () => {
    expect(
      computeInstruction('regex', 'abc', { query: '(', mode: 'regex' }).error,
    ).toBeTruthy();
    expect(computeInstruction('regex', 'abc', { query: '' }).error).toBeTruthy();
    expect(
      computeInstruction('regex', 'aaa', { query: 'a*', mode: 'regex' }).value,
    ).toBe(1);
    const text = 'да да\nнет\nда';
    expect(computeInstruction('regex', text, { query: 'да' }).value).toBe(3);
    expect(
      computeInstruction('regex', text, { query: 'да', unit: 'lines' }).value,
    ).toBe(2);
    expect(
      computeInstruction('regex', 'Да да', { query: 'да', caseSensitive: true }).value,
    ).toBe(1);
  });

  it('перевод из Python', () => {
    expect(looksLikePythonRegex('будто')).toBe(false);
    const t = translatePythonRegex('(?i)\\bво\\s+(\\w+\\s+){0,2}взгляд\\w*');
    expect(t.flags.caseSensitive).toBe(false);
    const text = 'Он смотрел во взгляде её. Вовремя. во тёмный взгляд';
    expect(
      computeInstruction('regex', text, { query: t.query, mode: 'regex' }).value,
    ).toBe(2);
  });

  it('шаблоны на примерах', () => {
    const text =
      '=== Глава ===\n\nОн шёл — и думал. Это был не сон, это явь.\n— Реплика — с тире.\n«Цитата — тоже.»\nНе свет, а тьма. Он не спал. А утром ушёл.\nЭто не для взрослых. Это про них.\n';
    expect(computeInstruction('regex', text, presetByKey('dash')!.params).value).toBe(
      1,
    );
    expect(computeInstruction('regex', text, presetByKey('nea')!.params).value).toBe(2);
    expect(
      computeInstruction('regex', text, presetByKey('nea_strict')!.params).value,
    ).toBe(1);
    expect(computeInstruction('regex', text, presetByKey('etone')!.params).value).toBe(
      1,
    );
  });
});

describe('config', () => {
  it('базовый конфиг — символы плюс три шаблона', () => {
    const { config, errors, warnings } = normalizeConfig(defaultConfig());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config?.instructions.map((i) => i.type)).toEqual([
      'chars',
      'regex',
      'regex',
      'regex',
    ]);
    expect(config?.instructions[0]?.barDivisor).toBe(1000);
  });

  it('добавляет «Символы», переименовывает дубли, переводит устаревшие типы', () => {
    const { config, warnings } = normalizeConfig({
      format: 'panalyzer-config',
      version: 1,
      instructions: [
        { id: 'a', type: 'dash' },
        { id: 'a', type: 'regex', params: { query: 'x', bogus: 1 } },
      ],
    });
    expect(config?.instructions[0]?.type).toBe('chars');
    expect(config?.instructions).toHaveLength(3);
    expect(config?.instructions[1]?.type).toBe('regex');
    expect(config?.instructions[1]?.title).toBe('Тире');
    expect(config?.instructions[1]?.id).not.toBe(config?.instructions[2]?.id);
    expect(warnings.some((w) => w.includes('устарел'))).toBe(true);
    expect(warnings.some((w) => w.includes('bogus'))).toBe(true);
  });

  it('ошибки формата и round-trip', () => {
    expect(parseConfigText('{').errors[0]).toMatch(/^не JSON/);
    expect(
      normalizeConfig({ format: 'x', version: 1, instructions: [] }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      normalizeConfig({
        format: 'panalyzer-config',
        version: 1,
        instructions: [{ type: 'nope' }],
      }).errors[0],
    ).toContain('nope');
    const text = serializeConfig(defaultConfig());
    expect(parseConfigText(text).errors).toEqual([]);
    expect(instructionKey({ type: 'regex', params: { query: 'x' } })).toBe(
      instructionKey({ type: 'regex', params: { query: 'x' } }),
    );
  });
});

describe('bars и tsv', () => {
  it('масштаб и деления', () => {
    expect(barScale([1, 2, 3], 1000)).toBe(20);
    expect(barScale([50, 100], 500)).toBe(5);
    expect(barScale([], 500)).toBe(20);
    expect(tickPx(20)).toBe(20);
    expect(tickPx(16)).toBe(16);
    expect(tickPx(2)).toBe(0);
    expect(perThousand(15, 30000)).toBe(0.5);
    expect(perThousand(15, 0)).toBeNull();
  });

  it('TSV, формат чисел, имена', () => {
    expect(
      rowsToTsv([
        ['01.txt', 66236, 66.236],
        ['a\tb', null],
      ]),
    ).toBe('01.txt\t66236\t66.24\na b\t');
    expect(formatNumber(66236)).toBe('66 236');
    expect(formatNumber(66.236, 1)).toBe('66,2');
    expect(safeName('не…, а…')).toBe('не…,_а…');
  });
});
