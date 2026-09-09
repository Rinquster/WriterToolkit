// Просмотр полного текста с подсветкой находок, метками в канавке и обзорной линейкой.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { applySquareBrackets, lineStarts, type Hit } from '../core/text';
import type { AnalyzerFile } from '../model';
import styles from '../AnalyzerPage.module.css';
import Icon from './icons';

const HIGHLIGHT_LIMIT = 2 * 1024 * 1024;

export interface TextViewerProps {
  file: AnalyzerFile;
  title: string;
  hits: readonly Hit[];
  startIndex: number;
  onBack: () => void;
  onStatus: (text: string) => void;
  copyText: (text: string) => Promise<boolean>;
}

interface LineModel {
  no: number;
  heading: boolean;
  hasHit: boolean;
  parts: { text: string; hit: number | null }[];
}

function buildLines(content: string, hits: readonly Hit[]): LineModel[] {
  const starts = lineStarts(content);
  const lines: LineModel[] = [];
  let hitIndex = 0;
  for (let lineNo = 0; lineNo < starts.length; lineNo += 1) {
    const lineStart = starts[lineNo] ?? 0;
    const next = starts[lineNo + 1];
    const lineEnd = next !== undefined ? next - 1 : content.length;
    const lineText = content.slice(lineStart, lineEnd).replace(/\r$/, '');
    while (hitIndex < hits.length && (hits[hitIndex]?.end ?? 0) <= lineStart)
      hitIndex += 1;
    const parts: LineModel['parts'] = [];
    const ranges: { index: number; start: number; end: number }[] = [];
    let k = hitIndex;
    while (k < hits.length && (hits[k]?.start ?? Infinity) < lineEnd) {
      const hit = hits[k];
      if (hit)
        ranges.push({
          index: k,
          start: Math.max(hit.start, lineStart),
          end: Math.min(hit.end, lineEnd),
        });
      k += 1;
    }
    let pos = lineStart;
    for (const range of ranges) {
      if (range.start < pos) continue;
      if (range.start > pos)
        parts.push({ text: content.slice(pos, range.start), hit: null });
      parts.push({ text: content.slice(range.start, range.end), hit: range.index });
      pos = range.end;
    }
    if (pos < lineEnd)
      parts.push({ text: content.slice(pos, lineEnd).replace(/\r$/, ''), hit: null });
    lines.push({
      no: lineNo + 1,
      heading: /^===\s.*\s===$/.test(lineText.trim()),
      hasHit: ranges.length > 0,
      parts,
    });
  }
  return lines;
}

export default function TextViewer({
  file,
  title,
  hits,
  startIndex,
  onBack,
  onStatus,
  copyText,
}: TextViewerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => hits.slice().sort((a, b) => a.start - b.start), [hits]);
  const tooBig = file.content.length > HIGHLIGHT_LIMIT;
  const lines = useMemo(
    () => buildLines(file.content, tooBig ? [] : sorted),
    [file.content, sorted, tooBig],
  );
  const [current, setCurrent] = useState(() =>
    sorted.length ? Math.max(0, Math.min(sorted.length - 1, startIndex)) : -1,
  );
  const rulerRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, height: 24 });
  const [dragging, setDragging] = useState(false);

  // Геометрия ползунка: доля видимой части, но не меньше 24 px.
  const geometry = useCallback(() => {
    const body = bodyRef.current;
    const ruler = rulerRef.current;
    if (!body || !ruler) return { track: 0, maxScroll: 0, height: 24, top: 0 };
    const track = ruler.clientHeight;
    const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
    const height =
      maxScroll === 0
        ? track
        : Math.max(24, (body.clientHeight / body.scrollHeight) * track);
    const top = maxScroll === 0 ? 0 : (body.scrollTop / maxScroll) * (track - height);
    return { track, maxScroll, height, top };
  }, []);

  const updateView = useCallback(() => {
    const { height, top } = geometry();
    setThumb({ height, top });
  }, [geometry]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.focus({ preventScroll: true });
    updateView();
    if (!('ResizeObserver' in window)) return;
    const observer = new ResizeObserver(updateView);
    observer.observe(body);
    return () => observer.disconnect();
  }, [updateView]);

  // Линейка работает как скроллбар: ползунок тянется, клик по дорожке перематывает.
  const onRulerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const body = bodyRef.current;
    const ruler = event.currentTarget;
    if (!body) return;
    event.preventDefault();
    const g = geometry();
    const onThumb =
      event.target instanceof HTMLElement && event.target.dataset.role === 'thumb';
    if (!onThumb) {
      const wanted = event.clientY - ruler.getBoundingClientRect().top - g.height / 2;
      body.scrollTop = (wanted / Math.max(1, g.track - g.height)) * g.maxScroll;
    }
    const startY = event.clientY;
    const startScroll = body.scrollTop;
    ruler.setPointerCapture(event.pointerId);
    setDragging(true);
    const onMove = (move: PointerEvent) => {
      const now = geometry();
      const perPixel = now.maxScroll / Math.max(1, now.track - now.height);
      body.scrollTop = startScroll + (move.clientY - startY) * perPixel;
    };
    const onUp = () => {
      ruler.removeEventListener('pointermove', onMove);
      ruler.removeEventListener('pointerup', onUp);
      ruler.removeEventListener('pointercancel', onUp);
      setDragging(false);
    };
    ruler.addEventListener('pointermove', onMove);
    ruler.addEventListener('pointerup', onUp);
    ruler.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || current < 0) return;
    const mark = body.querySelector<HTMLElement>(`mark[data-hit="${current}"]`);
    if (mark) {
      const top =
        mark.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop;
      body.scrollTop = Math.max(0, top - body.clientHeight / 3);
    } else {
      const hit = sorted[current];
      body
        .querySelector(`[data-line="${hit?.lineStart ?? 0}"]`)
        ?.scrollIntoView({ block: 'center' });
    }
  }, [current, sorted]);

  const step = (delta: number) => {
    if (!sorted.length) return;
    setCurrent((value) => (value + delta + sorted.length) % sorted.length);
  };
  const currentLine = current >= 0 ? sorted[current]?.lineStart : undefined;

  return (
    <div className={styles.viewer} data-testid="analyzer-viewer">
      <div className={styles.viewerBar}>
        <button type="button" className={styles.toolButton} onClick={onBack}>
          <Icon name="back" size={14} />
          <span>К таблице</span>
        </button>
        <span className={styles.viewerTitle}>
          {file.name} · {title}
        </span>
        <span className={styles.findCount} data-testid="viewer-count">
          {sorted.length ? `${current + 1} из ${sorted.length}` : 'Находок нет'}
        </span>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.iconOnly}`}
          title="Предыдущая находка (Shift+Enter)"
          aria-label="Предыдущая находка"
          disabled={!sorted.length}
          onClick={() => step(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.iconOnly}`}
          title="Следующая находка (Enter)"
          aria-label="Следующая находка"
          disabled={!sorted.length}
          onClick={() => step(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Скопировать текст со скобками вокруг находок"
          onClick={async () => {
            const ok = await copyText(applySquareBrackets(file.content, sorted));
            onStatus(ok ? 'Скопирован текст со скобками' : 'Не удалось скопировать');
          }}
        >
          <Icon name="copy" size={14} />
          <span>Со скобками</span>
        </button>
      </div>
      <div className={styles.viewerStage}>
        <div
          ref={bodyRef}
          className={styles.viewerBody}
          tabIndex={0}
          onScroll={updateView}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onBack();
            }
          }}
        >
          {tooBig && (
            <p className={styles.formError}>
              Файл больше 2 МБ: подсветка отключена, пользуйтесь списком находок.
            </p>
          )}
          {lines.map((line) => {
            const isCurrent =
              line.no === currentLine &&
              line.parts.some((part) => part.hit === current);
            const classes = [styles.viewerLine];
            if (line.heading) classes.push(styles.viewerHeading);
            if (line.hasHit) classes.push(styles.hasHit);
            if (isCurrent) classes.push(styles.isCurrent);
            return (
              <div key={line.no} className={classes.join(' ')} data-line={line.no}>
                <span className={styles.lineNo}>{line.no}</span>
                <span className={styles.lineText}>
                  {line.parts.length === 0
                    ? ''
                    : line.parts.map((part, index): ReactNode =>
                        part.hit === null ? (
                          part.text
                        ) : (
                          <mark
                            key={index}
                            className={`${styles.hit} ${part.hit === current ? styles.hitCurrent : ''}`}
                            data-hit={part.hit}
                          >
                            {part.text}
                          </mark>
                        ),
                      )}
                </span>
              </div>
            );
          })}
        </div>
        <div
          ref={rulerRef}
          className={`${styles.viewerRuler} ${dragging ? styles.rulerDragging : ''}`}
          aria-hidden="true"
          onPointerDown={onRulerPointerDown}
        >
          {sorted.map((hit, index) => (
            <div
              key={`${hit.start}-${index}`}
              className={`${styles.rulerMark} ${index === current ? styles.rulerMarkCurrent : ''}`}
              style={{
                top: `${((hit.lineStart - 1) / Math.max(1, lines.length)) * 100}%`,
              }}
              title={`строка ${hit.lineStart}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setCurrent(index)}
            />
          ))}
          <div
            className={styles.rulerThumb}
            data-role="thumb"
            style={{ top: thumb.top, height: thumb.height }}
          />
        </div>
      </div>
    </div>
  );
}
