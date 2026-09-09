// Строки, находки и отчёты: порт соответствующих функций aio_v2.py.
// Смещения — в единицах JS-строки (UTF-16); объём считается отдельно по кодовым точкам.

/** Аналог Python `\b` для кириллицы: граница между словесным и несловесным символом. */
export const WB_BEFORE = '(?<![\\p{L}\\p{N}_])';
export const WB_AFTER = '(?![\\p{L}\\p{N}_])';

// Python str.splitlines() режет не только по \n и \r\n.
// eslint-disable-next-line no-control-regex
const LINE_BREAK_RE = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;

export interface Hit {
  kind: string;
  text: string;
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
  reason: string;
  extra: Record<string, string | number>;
}

/** Как Python text.splitlines(True): строки вместе с окончаниями. */
export function splitLinesKeepEnds(text: string): string[] {
  const lines: string[] = [];
  let last = 0;
  LINE_BREAK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINE_BREAK_RE.exec(text)) !== null) {
    lines.push(text.slice(last, match.index + match[0].length));
    last = match.index + match[0].length;
  }
  if (last < text.length) lines.push(text.slice(last));
  return lines;
}

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** bisect_right: номер строки (с единицы) для смещения. */
export function lineNoForOffset(starts: number[], offset: number): number {
  const target = Math.max(0, offset);
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (target < (starts[mid] ?? 0)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function makeHit(
  kind: string,
  text: string,
  start: number,
  end: number,
  starts: number[],
  reason: string,
  extra: Record<string, string | number> = {},
): Hit {
  return {
    kind,
    text,
    start,
    end,
    lineStart: lineNoForOffset(starts, start),
    lineEnd: lineNoForOffset(starts, Math.max(start, end - 1)),
    reason,
    extra,
  };
}

/** Контекст ±N строк вокруг находки (regex_context). */
export function lineContext(
  text: string,
  starts: number[],
  start: number,
  end: number,
  contextLines: number,
): { from: number; to: number; text: string } {
  const lines = splitLinesKeepEnds(text);
  if (lines.length === 0) return { from: 1, to: 1, text };
  const first = lineNoForOffset(starts, start);
  const last = lineNoForOffset(starts, Math.max(start, end - 1));
  const from = Math.max(1, first - contextLines);
  const to = Math.min(lines.length, last + contextLines);
  return {
    from,
    to,
    text: lines
      .slice(from - 1, to)
      .join('')
      .replace(/[\r\n]+$/, ''),
  };
}

/** Полный текст с находками в квадратных скобках (формат full-отчёта). */
export function applySquareBrackets(text: string, hits: readonly Hit[]): string {
  const ranges = hits
    .filter((hit) => hit.end > hit.start)
    .map((hit) => [hit.start, hit.end] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (ranges.length === 0) return text;
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) merged.push([start, end]);
    else last[1] = Math.max(last[1], end);
  }
  let output = text;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const range = merged[i];
    if (!range) continue;
    const [start, end] = range;
    output = `${output.slice(0, start)}[${output.slice(start, end)}]${output.slice(end)}`;
  }
  return output;
}

/** Текст hits-отчёта в формате aio_v2 (write_hits_report). */
export function hitsReport(header: readonly string[], hits: readonly Hit[]): string {
  const lines = [...header];
  if (lines.length) lines.push('');
  hits.forEach((hit, index) => {
    let loc = `, строки ${hit.lineStart}`;
    if (hit.lineEnd && hit.lineEnd !== hit.lineStart) loc += `-${hit.lineEnd}`;
    lines.push(`--- ${index + 1}. ${hit.kind}${loc} ---`);
    if (hit.reason) lines.push(`Причина: ${hit.reason}`);
    lines.push(hit.text.trim());
    lines.push('');
  });
  const body = lines.join('\n').replace(/\s+$/, '');
  return body + (lines.length ? '\n' : '');
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Число кодовых точек, как len() в Python. */
export function countCodePoints(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
    }
    count += 1;
  }
  return count;
}
