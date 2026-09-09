// Два типа инструкций: «Символы» (объём файла) и регулярка. Всё остальное — шаблоны регулярок.
import {
  WB_AFTER,
  WB_BEFORE,
  countCodePoints,
  escapeRegex,
  lineContext,
  lineStarts,
  makeHit,
  splitLinesKeepEnds,
  type Hit,
} from './text';

export type InstructionType = 'chars' | 'regex';

export interface RegexParams {
  query: string;
  mode: 'literal' | 'regex';
  caseSensitive: boolean;
  multiline: boolean;
  unit: 'matches' | 'lines';
  contextLines: number;
}

export const REGEX_DEFAULTS: RegexParams = {
  query: '',
  mode: 'literal',
  caseSensitive: false,
  multiline: false,
  unit: 'matches',
  contextLines: 1,
};

export interface ComputeResult {
  value: number | null;
  hits: Hit[];
  error?: string;
}

export function physicalLinesAfterFirstTwo(text: string): string {
  return splitLinesKeepEnds(text).slice(2).join('');
}

/** Число кодовых точек после первых двух физических строк (заголовок и пустая строка). */
export function computeChars(content: string): ComputeResult {
  return { value: countCodePoints(physicalLinesAfterFirstTwo(content)), hits: [] };
}

/** Компилирует запрос; бросает Error с человекочитаемым текстом. */
export function compileQuery(params: Partial<RegexParams>): RegExp {
  const p = { ...REGEX_DEFAULTS, ...params };
  if (!p.query) throw new Error('поисковый запрос пуст');
  let flags = 'gu';
  if (!p.caseSensitive) flags += 'i';
  if (p.multiline) flags += 'ms';
  const source = p.mode === 'literal' ? escapeRegex(p.query) : p.query;
  try {
    return new RegExp(source, flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `невалидная регулярка: ${message.replace(/^Invalid regular expression: /, '')}`,
    );
  }
}

export function computeRegex(
  content: string,
  params: Partial<RegexParams>,
): ComputeResult {
  const p = { ...REGEX_DEFAULTS, ...params };
  const re = compileQuery(p);
  const starts = lineStarts(content);
  const hits: Hit[] = [];
  const lines = new Set<number>();
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    const ctx = lineContext(content, starts, start, end, p.contextLines);
    const hit = makeHit(
      p.mode === 'regex' ? 'regex' : 'literal',
      match[0],
      start,
      end,
      starts,
      'совпадение поискового запроса',
      {
        context: ctx.text,
        context_line_start: ctx.from,
        context_line_end: ctx.to,
      },
    );
    hits.push(hit);
    for (let line = hit.lineStart; line <= hit.lineEnd; line += 1) lines.add(line);
  }
  return { value: p.unit === 'lines' ? lines.size : hits.length, hits };
}

export function computeInstruction(
  type: InstructionType,
  content: string,
  params: Partial<RegexParams>,
): ComputeResult {
  try {
    if (type === 'chars') return computeChars(content);
    if (type === 'regex') return computeRegex(content, params);
    return { value: null, hits: [], error: `неизвестный тип «${String(type)}»` };
  } catch (error) {
    return {
      value: null,
      hits: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------- Перевод запросов из диалекта Python ----------

const PY_MARKERS = [/^\(\?[imsx]+\)/, /\(\?P</, /\\b/, /\\B/, /\\w/, /\\W/];

export function looksLikePythonRegex(query: string): boolean {
  return PY_MARKERS.some((re) => re.test(query || ''));
}

export interface TranslatedRegex {
  query: string;
  flags: { caseSensitive?: boolean; multiline?: boolean };
  changes: string[];
}

/** Ведущие (?i)/(?s)/(?m) → флаги, (?P<name> → (?<name>, \b → границы по Unicode, \w → буквы и цифры. */
export function translatePythonRegex(query: string): TranslatedRegex {
  let out = query || '';
  const flags: TranslatedRegex['flags'] = {};
  const changes: string[] = [];
  const lead = /^\(\?([imsx]+)\)/.exec(out);
  if (lead && lead[1]) {
    out = out.slice(lead[0].length);
    if (lead[1].includes('i')) {
      flags.caseSensitive = false;
      changes.push('(?i) → «без учёта регистра»');
    }
    if (lead[1].includes('s') || lead[1].includes('m')) {
      flags.multiline = true;
      changes.push('(?s)/(?m) → «многострочный»');
    }
  }
  if (out.includes('(?P<')) {
    out = out.replace(/\(\?P</g, '(?<');
    changes.push('(?P<name> → (?<name>');
  }
  if (/\\[bB]/.test(out)) {
    out = out.replace(
      /\\b/g,
      `(?:${WB_BEFORE}(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])${WB_AFTER})`,
    );
    out = out.replace(
      /\\B/g,
      '(?:(?<=[\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))',
    );
    changes.push('\\b → границы слова по Unicode');
  }
  if (/\\[wW]/.test(out)) {
    out = out.replace(/\\w/g, '[\\p{L}\\p{N}_]').replace(/\\W/g, '[^\\p{L}\\p{N}_]');
    changes.push('\\w → буквы, цифры и подчёркивание');
  }
  return { query: out, flags, changes };
}

export function looksLikeRegexSyntax(query: string): boolean {
  return /[\\[\](){}|^$*+?]/.test(query);
}
