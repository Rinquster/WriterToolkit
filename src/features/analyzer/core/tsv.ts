/** Прямоугольник ячеек → TSV: ячейки через табуляцию, строки через перевод строки. */
export function rowsToTsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return rows.map((row) => row.map(cellText).join('\t')).join('\n');
}

function cellText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number')
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 100) / 100);
  return String(value).replace(/[\t\r\n]+/g, ' ');
}

/** Число для показа: разряды через тонкий пробел, дробная часть с запятой. */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const fixed = Number(value).toFixed(digits);
  const [int = '', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac ? `${grouped},${frac}` : grouped;
}

export function safeName(value: string, fallback = 'instruction'): string {
  let cleaned = String(value)
    .replace(/[<>:"/\\|?*\s]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  if (!cleaned) cleaned = fallback;
  return cleaned.slice(0, 48);
}
