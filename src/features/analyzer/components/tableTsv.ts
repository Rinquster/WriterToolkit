import { rowsToTsv } from '../core/tsv';

/** Вся таблица как TSV, с заголовками. */
export function tableToTsv(host: HTMLElement | null): string {
  const table = host?.querySelector('table');
  if (!table) return '';
  const rows: string[][] = [];
  rows.push(
    Array.from(table.querySelectorAll('thead th')).map(
      (th) => th.querySelector('span')?.textContent ?? th.textContent ?? '',
    ),
  );
  for (const tr of table.querySelectorAll('tbody tr, tfoot tr')) {
    rows.push(
      Array.from(tr.querySelectorAll<HTMLElement>('td')).map(
        (td) => td.dataset.copy ?? '',
      ),
    );
  }
  return rowsToTsv(rows);
}
