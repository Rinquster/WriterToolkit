// Таблица инструкции: столбцы, сортировка, полоски с делениями, выделение ячеек и TSV.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { barScale, tickPx } from '../core/bars';
import type { Instruction } from '../core/config';
import { formatNumber, rowsToTsv } from '../core/tsv';
import type { SortSpec } from '../model';
import styles from '../AnalyzerPage.module.css';

export interface TableRow {
  fileId: string;
  name: string;
  prefix: string;
  value: number | null;
  derived: number | null;
  /** undefined — ещё считается, null — неприменимо */
  per1000: number | null | undefined;
  error: string | null;
  pending: boolean;
}

export interface TableModel {
  instruction: Instruction;
  rows: TableRow[];
  showDerived: boolean;
  derivedTitle: string;
  showPer1000: boolean;
  barTarget: string;
  sort: SortSpec | null;
  clickable: boolean;
}

export interface ResultsTableProps {
  model: TableModel;
  onSort: (key: SortSpec['key']) => void;
  onBarTarget: (target: string) => void;
  onRowOpen: (fileId: string) => void;
  onRowSelect: (fileId: string) => void;
  onStatus: (text: string) => void;
  copyText: (text: string) => Promise<boolean>;
}

interface Column {
  key: 'name' | 'value' | 'derived' | 'per1000' | 'bar';
  title: string;
  sortable?: boolean;
  num?: boolean;
  digits?: number;
  bar?: boolean;
}

interface Cell {
  r: number;
  c: number;
}

const BAR_PADDING = 28;
const CLICK_DELAY_MS = 220;

function columnsOf(model: TableModel): Column[] {
  const columns: Column[] = [
    { key: 'name', title: 'Файл', sortable: true },
    { key: 'value', title: 'Значение', sortable: true, num: true },
  ];
  if (model.showDerived)
    columns.push({
      key: 'derived',
      title: model.derivedTitle,
      sortable: true,
      num: true,
      digits: 1,
    });
  if (model.showPer1000)
    columns.push({
      key: 'per1000',
      title: 'На 1000 символов',
      sortable: true,
      num: true,
      digits: 2,
    });
  columns.push({ key: 'bar', title: 'Полоска', bar: true });
  return columns;
}

function barTargets(model: TableModel): [string, string][] {
  const targets: [string, string][] = [];
  if (model.showDerived) targets.push(['derived', model.derivedTitle]);
  else targets.push(['value', 'по значению']);
  if (model.showPer1000) targets.push(['per1000', 'на 1000 символов']);
  return targets;
}

function targetValue(row: TableRow, target: string): number | null {
  if (target === 'derived') return row.derived;
  if (target === 'per1000') return row.per1000 ?? null;
  return row.value;
}

function round(value: number, digits: number): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

export default function ResultsTable({
  model,
  onSort,
  onBarTarget,
  onRowOpen,
  onRowSelect,
  onStatus,
  copyText,
}: ResultsTableProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const barHeadRef = useRef<HTMLTableCellElement>(null);
  const [scale, setScale] = useState({ k: 20, tick: 20 });
  const [selection, setSelection] = useState<{ anchor: Cell; focus: Cell } | null>(
    null,
  );
  const dragging = useRef(false);
  const clickTimer = useRef(0);

  const columns = columnsOf(model);
  const targets = barTargets(model);
  const target = targets.some(([key]) => key === model.barTarget)
    ? model.barTarget
    : (targets[0]?.[0] ?? 'value');
  const rowCount = model.rows.length + (model.rows.length ? 2 : 0);

  const values = model.rows.map((row) => targetValue(row, target));
  const valuesKey = values.join(',');

  useLayoutEffect(() => {
    const measure = () => {
      const head = barHeadRef.current;
      const available = head ? Math.max(40, head.clientWidth - BAR_PADDING) : 200;
      const k = barScale(
        valuesKey.split(',').map((v) => (v === '' ? null : Number(v))),
        available,
        20,
      );
      setScale({ k, tick: tickPx(k) });
    };
    measure();
    const host = hostRef.current;
    if (!host || !('ResizeObserver' in window)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [valuesKey]);

  useEffect(() => {
    const onPointer = (event: globalThis.PointerEvent) => {
      if (
        selection &&
        hostRef.current &&
        !hostRef.current.contains(event.target as Node)
      )
        setSelection(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [selection]);

  const range = selection
    ? {
        r1: Math.min(selection.anchor.r, selection.focus.r),
        r2: Math.max(selection.anchor.r, selection.focus.r),
        c1: Math.min(selection.anchor.c, selection.focus.c),
        c2: Math.max(selection.anchor.c, selection.focus.c),
      }
    : null;
  const isSelected = (r: number, c: number) =>
    Boolean(range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2);

  const cellOf = (node: EventTarget | null): Cell | null => {
    const td = node instanceof Element ? node.closest<HTMLElement>('td[data-r]') : null;
    return td ? { r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const at = cellOf(event.target);
    if (!at) return;
    setSelection((current) =>
      event.shiftKey && current
        ? { anchor: current.anchor, focus: at }
        : { anchor: at, focus: at },
    );
    dragging.current = true;
    hostRef.current?.focus({ preventScroll: true });
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const at = cellOf(event.target);
    if (!at) return;
    setSelection((current) =>
      current && (current.focus.r !== at.r || current.focus.c !== at.c)
        ? { anchor: current.anchor, focus: at }
        : current,
    );
  };
  const stopDrag = () => {
    dragging.current = false;
  };

  const selectionTsv = () => {
    if (!range || !hostRef.current) return '';
    const rows: string[][] = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      const row: string[] = [];
      for (let c = range.c1; c <= range.c2; c += 1) {
        row.push(
          hostRef.current.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)
            ?.dataset.copy ?? '',
        );
      }
      rows.push(row);
    }
    return rowsToTsv(rows);
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (rowCount === 0) return;
    const cols = columns.length;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection({ anchor: { r: 0, c: 0 }, focus: { r: rowCount - 1, c: cols - 1 } });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      if (!range) return;
      event.preventDefault();
      const ok = await copyText(selectionTsv());
      const count = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
      onStatus(ok ? `Скопировано ячеек: ${count}` : 'Не удалось скопировать');
      return;
    }
    if (event.key === 'Escape') {
      setSelection(null);
      return;
    }
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    const base = selection ? selection.focus : { r: 0, c: 0 };
    const next = {
      r: Math.max(0, Math.min(rowCount - 1, base.r + move[0])),
      c: Math.max(0, Math.min(cols - 1, base.c + move[1])),
    };
    setSelection(
      event.shiftKey && selection
        ? { anchor: selection.anchor, focus: next }
        : { anchor: next, focus: next },
    );
    hostRef.current
      ?.querySelector(`td[data-r="${next.r}"][data-c="${next.c}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  // одиночный клик по имени откладывается: если за ним идёт двойной, панель находок не дёргается
  const onNameClick = (fileId: string, detail: number) => {
    window.clearTimeout(clickTimer.current);
    if (detail > 1) return;
    clickTimer.current = window.setTimeout(() => onRowSelect(fileId), CLICK_DELAY_MS);
  };
  const onNameDoubleClick = (fileId: string) => {
    window.clearTimeout(clickTimer.current);
    if (model.clickable) onRowOpen(fileId);
  };

  const done = model.rows.filter((row) => typeof row.value === 'number');
  const sum = done.reduce((acc, row) => acc + (row.value ?? 0), 0);
  const avg = done.length ? sum / done.length : null;
  const perDone = model.rows.filter((row) => typeof row.per1000 === 'number');
  const avgPer = perDone.length
    ? perDone.reduce((acc, row) => acc + (row.per1000 ?? 0), 0) / perDone.length
    : null;
  const divisor = model.instruction.barDivisor || 1;
  const shownK =
    scale.k >= 1
      ? formatNumber(scale.k, Number.isInteger(scale.k) ? 0 : 1)
      : formatNumber(scale.k, 2);
  const scaleNote = scale.tick
    ? `1 ед. = ${shownK} px, деление = 1 ед.`
    : `1 ед. = ${shownK} px, деления слишком мелкие`;

  return (
    <div
      ref={hostRef}
      className={styles.tableHost}
      tabIndex={0}
      data-testid="analyzer-table"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={(event) => void onKeyDown(event)}
    >
      <table
        className={styles.dataTable}
        data-instruction-id={model.instruction.id}
        style={{
          ['--bar-k' as string]: String(scale.k),
          ['--bar-tick' as string]: scale.tick ? `${scale.tick}px` : '100000px',
        }}
      >
        <thead>
          <tr>
            {columns.map((column) =>
              column.bar ? (
                <th
                  key={column.key}
                  ref={barHeadRef}
                  scope="col"
                  className={styles.barHead}
                >
                  <div className={styles.barHeadInner}>
                    <span>{column.title}</span>
                    {targets.length > 1 && (
                      <div
                        className={styles.segmented}
                        role="group"
                        aria-label="Цель полоски"
                      >
                        {targets.map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={key === target}
                            onClick={() => onBarTarget(key)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className={styles.scaleNote} data-testid="scale-note">
                      {scaleNote}
                    </span>
                  </div>
                </th>
              ) : (
                <th
                  key={column.key}
                  scope="col"
                  className={column.sortable ? styles.sortable : undefined}
                  aria-sort={
                    model.sort?.key === column.key
                      ? model.sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  onClick={
                    column.sortable
                      ? () => onSort(column.key as SortSpec['key'])
                      : undefined
                  }
                >
                  {column.title}
                  {model.sort?.key === column.key && (
                    <span className={styles.sortMark}>
                      {model.sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, r) => (
            <tr
              key={row.fileId}
              data-file-id={row.fileId}
              className={
                model.clickable && !row.pending && !row.error
                  ? styles.clickable
                  : undefined
              }
            >
              {columns.map((column, c) => {
                const selected = isSelected(r, c) ? ` ${styles.cellSelected}` : '';
                if (column.key === 'name') {
                  return (
                    <td
                      key={column.key}
                      className={`${styles.name}${selected}`}
                      data-r={r}
                      data-c={c}
                      data-copy={row.prefix ? `${row.prefix}/${row.name}` : row.name}
                      onClick={(event) => onNameClick(row.fileId, event.detail)}
                      onDoubleClick={() => onNameDoubleClick(row.fileId)}
                    >
                      {row.prefix && (
                        <span className={styles.sectionPrefix}>{row.prefix} / </span>
                      )}
                      {row.name}
                    </td>
                  );
                }
                if (column.bar) {
                  const v = targetValue(row, target);
                  return (
                    <td
                      key={column.key}
                      className={selected.trim() || undefined}
                      data-r={r}
                      data-c={c}
                      data-copy={typeof v === 'number' ? round(v, 2) : ''}
                    >
                      {typeof v === 'number' && v > 0 && (
                        <div
                          className={styles.bar}
                          style={{ width: `calc(var(--bar-k) * ${v} * 1px)` }}
                        />
                      )}
                    </td>
                  );
                }
                const v =
                  column.key === 'value'
                    ? row.value
                    : column.key === 'derived'
                      ? row.derived
                      : row.per1000;
                let text = '';
                let extra = '';
                let copy = '';
                let title: string | undefined;
                if (row.pending) {
                  text = '…';
                  extra = styles.muted ?? '';
                } else if (row.error) {
                  text = '—';
                  extra = styles.cellError ?? '';
                  title = row.error;
                } else if (v === undefined) {
                  text = '…';
                  extra = styles.muted ?? '';
                } else if (v === null) {
                  text = '—';
                  extra = styles.muted ?? '';
                  title = 'объём файла нулевой';
                } else {
                  text = formatNumber(v, column.digits ?? 0);
                  copy = column.digits ? round(v, 2) : String(v);
                }
                return (
                  <td
                    key={column.key}
                    className={`${styles.num} ${extra}${selected}`}
                    data-r={r}
                    data-c={c}
                    data-copy={copy}
                    title={title}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {model.rows.length > 0 && (
          <tfoot>
            {[
              {
                label: 'Итого',
                r: model.rows.length,
                value: sum,
                derived: sum / divisor,
                per: null as number | null,
                digits: 0,
              },
              {
                label: 'Среднее',
                r: model.rows.length + 1,
                value: avg,
                derived: avg === null ? null : avg / divisor,
                per: avgPer,
                digits: 1,
              },
            ].map((foot) => (
              <tr key={foot.label}>
                {columns.map((column, c) => {
                  const selected = isSelected(foot.r, c)
                    ? ` ${styles.cellSelected}`
                    : '';
                  let text = '';
                  let copy = '';
                  if (column.key === 'name') {
                    text = foot.label;
                    copy = foot.label;
                  } else if (column.key === 'value' && foot.value !== null) {
                    text = formatNumber(foot.value, foot.digits);
                    copy = round(foot.value, foot.digits);
                  } else if (column.key === 'derived' && foot.derived !== null) {
                    text = formatNumber(foot.derived, 1);
                    copy = round(foot.derived, 1);
                  } else if (column.key === 'per1000' && foot.per !== null) {
                    text = formatNumber(foot.per, 2);
                    copy = round(foot.per, 2);
                  }
                  return (
                    <td
                      key={column.key}
                      className={`${column.num ? styles.num : ''}${selected}`}
                      data-r={foot.r}
                      data-c={c}
                      data-copy={copy}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
