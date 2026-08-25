export const CHAR_CATEGORIES = [
  'cyrillic',
  'latin',
  'punctuation',
  'digit',
  'whitespace',
  'other',
] as const;

export const ANOMALY_KINDS = [
  'mixedScript',
  'extraSpace',
  'trailingSpace',
  'spaceBeforePunctuation',
  'invisible',
  'typography',
  'repeatedWord',
  'fillerWord',
] as const;

export type CharCategory = (typeof CHAR_CATEGORIES)[number];
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];
export type HighlightLayer = CharCategory | AnomalyKind | 'search';

export interface TextRange {
  start: number;
  end: number;
}

export interface HighlightRun extends TextRange {
  layer?: HighlightLayer;
}

export interface HighlightPlan {
  runs: HighlightRun[];
  truncated: boolean;
}

export interface TextAnalysis {
  characters: number;
  words: number;
  lines: number;
  stats: Record<CharCategory, number>;
  categories: Uint8Array;
  anomalies: Record<AnomalyKind, TextRange[]>;
}

export interface SearchOptions {
  useRegex: boolean;
  caseSensitive: boolean;
}

export interface SearchOutcome {
  ranges: TextRange[];
  error: string | undefined;
  truncated: boolean;
}

export interface HighlightInput {
  analysis: TextAnalysis;
  categories: readonly CharCategory[];
  anomalies: readonly AnomalyKind[];
  search: readonly TextRange[];
}

/** Выше этого объёма подсветка отключается, счётчики продолжают работать. */
export const MAX_HIGHLIGHT_LENGTH = 300_000;
/** Верхняя граница числа спанов в слое подсветки. */
export const MAX_HIGHLIGHT_RUNS = 20_000;
/** Верхняя граница числа совпадений поиска. */
export const MAX_SEARCH_MATCHES = 5_000;

export const DEFAULT_FILLER_WORDS = [
  'очень',
  'просто',
  'как бы',
  'вообще',
  'буквально',
  'реально',
  'типа',
  'короче',
  'в общем',
  'практически',
  'действительно',
  'наверное',
  'конечно',
  'всё-таки',
  'вот',
  'ну',
  'что-то',
  'как-то',
  'почему-то',
  'слегка',
  'довольно',
  'достаточно',
  'вроде',
  'словно',
  'будто',
  'кажется',
  'уже',
  'опять',
  'снова',
  'чуть-чуть',
  'весьма',
  'крайне',
  'абсолютно',
  'полностью',
  'лишь',
  'прямо',
  'вполне',
] as const;

const CATEGORY_INDEX: Record<CharCategory, number> = {
  cyrillic: 0,
  latin: 1,
  punctuation: 2,
  digit: 3,
  whitespace: 4,
  other: 5,
};

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const PUNCTUATION = /\p{P}/u;
const DIGIT = /\p{Nd}/u;
const WHITESPACE = /\s/u;

const LETTER_RUN = /\p{L}+/gu;
const WORD_TOKEN = /[\p{L}\p{M}\p{Nd}]+(?:['’-][\p{L}\p{M}\p{Nd}]+)*/gu;
const EXTRA_SPACE = / {2,}/g;
const TRAILING_SPACE = /[^\S\n]+(?=\n|$)/g;
const SPACE_BEFORE_PUNCTUATION = /[^\S\n]+(?=[,.!?;:…%»)\]}])/g;
const INVISIBLE = /[\u00A0\u00AD\u180E\u200B-\u200F\u202F\u2028\u2029\u2060\uFEFF]/g;
const TYPOGRAPHY = /"|\.\.\.|--|(?<=[ \u00A0])-(?=[ \u00A0])/g;
const SAME_LINE_GAP = /^[ \t\u00A0]+$/;

const categoryCache = new Map<number, CharCategory>();

interface WordToken extends TextRange {
  normalized: string;
}

export function analyzeText(
  text: string,
  fillerWords: readonly string[] = DEFAULT_FILLER_WORDS,
): TextAnalysis {
  const categories = new Uint8Array(text.length);
  const stats: Record<CharCategory, number> = {
    cyrillic: 0,
    latin: 0,
    punctuation: 0,
    digit: 0,
    whitespace: 0,
    other: 0,
  };
  let characters = 0;

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index) ?? 0;
    const size = codePoint > 0xffff ? 2 : 1;
    const category = classify(codePoint);
    const categoryIndex = CATEGORY_INDEX[category];

    categories[index] = categoryIndex;
    if (size === 2) {
      categories[index + 1] = categoryIndex;
    }
    stats[category] += 1;
    characters += 1;
    index += size;
  }

  const tokens = tokenizeWords(text);

  return {
    characters,
    words: tokens.length,
    lines: text === '' ? 0 : text.split('\n').length,
    stats,
    categories,
    anomalies: {
      mixedScript: findMixedScript(text),
      extraSpace: findExtraSpace(text),
      trailingSpace: collect(text, TRAILING_SPACE),
      spaceBeforePunctuation: collect(text, SPACE_BEFORE_PUNCTUATION),
      invisible: collect(text, INVISIBLE),
      typography: collect(text, TYPOGRAPHY),
      repeatedWord: findRepeatedWords(text, tokens),
      fillerWord: findFillerWords(text, tokens, fillerWords),
    },
  };
}

export function findMatches(
  text: string,
  query: string,
  options: SearchOptions,
): SearchOutcome {
  if (query === '' || text === '') {
    return { ranges: [], error: undefined, truncated: false };
  }

  const source = options.useRegex ? query : escapeRegExp(query);
  const flags = options.caseSensitive ? 'gu' : 'giu';
  let regex: RegExp;
  try {
    regex = new RegExp(source, flags);
  } catch {
    try {
      // Пользовательский шаблон может быть несовместим со строгим режимом `u`.
      regex = new RegExp(source, flags.replace('u', ''));
    } catch (error: unknown) {
      return {
        ranges: [],
        error:
          error instanceof Error ? error.message : 'Неверное регулярное выражение.',
        truncated: false,
      };
    }
  }

  const ranges: TextRange[] = [];
  let truncated = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex = match.index + 1;
      if (regex.lastIndex > text.length) break;
      continue;
    }
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (ranges.length >= MAX_SEARCH_MATCHES) {
      truncated = true;
      break;
    }
  }

  return { ranges, error: undefined, truncated };
}

export function buildHighlightPlan(text: string, input: HighlightInput): HighlightPlan {
  if (text.length === 0 || text.length > MAX_HIGHLIGHT_LENGTH) {
    return { runs: [], truncated: false };
  }

  const layers: HighlightLayer[] = [];
  const paint = new Uint8Array(text.length);

  if (input.categories.length > 0) {
    const idByCategory = new Uint8Array(CHAR_CATEGORIES.length);
    for (const category of input.categories) {
      idByCategory[CATEGORY_INDEX[category]] = pushLayer(layers, category);
    }
    for (let index = 0; index < text.length; index += 1) {
      const id = idByCategory[input.analysis.categories[index] ?? 0] ?? 0;
      if (id !== 0) {
        paint[index] = id;
      }
    }
  }

  const activeAnomalies = new Set(input.anomalies);
  for (const kind of ANOMALY_KINDS) {
    if (!activeAnomalies.has(kind)) continue;
    const id = pushLayer(layers, kind);
    for (const range of input.analysis.anomalies[kind]) {
      paint.fill(id, range.start, range.end);
    }
  }

  if (input.search.length > 0) {
    const id = pushLayer(layers, 'search');
    for (const range of input.search) {
      paint.fill(id, range.start, range.end);
    }
  }

  return coalesce(text, paint, layers);
}

export function parseFillerWords(source: string): string[] {
  return source
    .split(/[\n,;]+/)
    .map((entry) => normalizeWord(entry.trim()))
    .filter((entry) => entry.length > 0);
}

function coalesce(
  text: string,
  paint: Uint8Array,
  layers: readonly HighlightLayer[],
): HighlightPlan {
  const runs: HighlightRun[] = [];
  let start = 0;
  let current = paint[0] ?? 0;

  for (let index = 1; index <= text.length; index += 1) {
    const value = index < text.length ? (paint[index] ?? 0) : -1;
    if (value === current) continue;

    runs.push({
      start,
      end: index,
      layer: current === 0 ? undefined : layers[current - 1],
    });
    if (runs.length >= MAX_HIGHLIGHT_RUNS && index < text.length) {
      runs.push({ start: index, end: text.length });
      return { runs, truncated: true };
    }
    start = index;
    current = value;
  }

  return { runs, truncated: false };
}

function pushLayer(layers: HighlightLayer[], layer: HighlightLayer): number {
  layers.push(layer);
  return layers.length;
}

function classify(codePoint: number): CharCategory {
  const cached = categoryCache.get(codePoint);
  if (cached !== undefined) return cached;

  const char = String.fromCodePoint(codePoint);
  const category: CharCategory = CYRILLIC.test(char)
    ? 'cyrillic'
    : LATIN.test(char)
      ? 'latin'
      : WHITESPACE.test(char)
        ? 'whitespace'
        : PUNCTUATION.test(char)
          ? 'punctuation'
          : DIGIT.test(char)
            ? 'digit'
            : 'other';

  categoryCache.set(codePoint, category);
  return category;
}

function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD_TOKEN)) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      normalized: normalizeWord(match[0]),
    });
  }
  return tokens;
}

function findMixedScript(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(LETTER_RUN)) {
    let cyrillic = false;
    let latin = false;
    for (const char of match[0]) {
      if (CYRILLIC.test(char)) cyrillic = true;
      else if (LATIN.test(char)) latin = true;
      if (cyrillic && latin) break;
    }
    if (cyrillic && latin) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

function findExtraSpace(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(EXTRA_SPACE)) {
    // Отступ в начале строки — осознанное форматирование, а не опечатка.
    if (match.index === 0 || text[match.index - 1] === '\n') continue;
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function findRepeatedWords(text: string, tokens: readonly WordToken[]): TextRange[] {
  const ranges: TextRange[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    if (!previous || !current) continue;
    if (previous.normalized !== current.normalized) continue;
    if (!SAME_LINE_GAP.test(text.slice(previous.end, current.start))) continue;
    ranges.push({ start: previous.start, end: current.end });
  }
  return ranges;
}

function findFillerWords(
  text: string,
  tokens: readonly WordToken[],
  fillerWords: readonly string[],
): TextRange[] {
  const phrases = fillerWords
    .map((phrase) => normalizeWord(phrase).split(/\s+/).filter(Boolean))
    .filter((parts) => parts.length > 0);
  if (phrases.length === 0) return [];

  const ranges: TextRange[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    for (const parts of phrases) {
      const last = matchPhrase(text, tokens, index, parts);
      if (!last) continue;
      const first = tokens[index];
      if (first) {
        ranges.push({ start: first.start, end: last.end });
      }
      break;
    }
  }
  return ranges;
}

function matchPhrase(
  text: string,
  tokens: readonly WordToken[],
  index: number,
  parts: readonly string[],
): WordToken | undefined {
  for (let offset = 0; offset < parts.length; offset += 1) {
    const token = tokens[index + offset];
    if (!token || token.normalized !== parts[offset]) return undefined;
    if (offset === 0) continue;
    const previous = tokens[index + offset - 1];
    if (!previous || !SAME_LINE_GAP.test(text.slice(previous.end, token.start))) {
      return undefined;
    }
  }
  return tokens[index + parts.length - 1];
}

function collect(text: string, regex: RegExp): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(regex)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replaceAll('ё', 'е');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
