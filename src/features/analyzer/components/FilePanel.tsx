// Панель файлов: секции, дроп с диска, клавиатура, делители между секциями.
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  SECTIONS,
  SECTION_ORDER,
  filesOfSection,
  formatSize,
  type AnalyzerFile,
  type SectionId,
} from '../model';
import styles from '../AnalyzerPage.module.css';
import Icon from './icons';

export interface FilePanelProps {
  files: readonly AnalyzerFile[];
  mdEnabled: boolean;
  activeFileId: string | null;
  weights: Partial<Record<SectionId, number>>;
  onWeights: (weights: Partial<Record<SectionId, number>>) => void;
  onCommitWeights: () => void;
  onImport: (section: SectionId) => void;
  onConvert: () => void;
  onExport: (section: SectionId) => void;
  onClear: (section: SectionId) => void;
  onOpen: (file: AnalyzerFile) => void;
  onView: (file: AnalyzerFile) => void;
  onMenu: (
    file: AnalyzerFile,
    x: number,
    y: number,
    opener: HTMLElement | null,
  ) => void;
  onDelete: (file: AnalyzerFile) => void;
  onRename: (file: AnalyzerFile) => void;
  onDrop: (section: SectionId, entries: FileSystemEntry[], plain: File[]) => void;
  onResizing: (resizing: boolean) => void;
}

function isFileTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types ?? []);
  return types.length === 0 || types.includes('Files');
}

export default function FilePanel(props: FilePanelProps) {
  const visible = SECTION_ORDER.filter(
    (section) => SECTIONS[section].always || (section === 'md' && props.mdEnabled),
  );
  const sidebarRef = useRef<HTMLElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const active = document.activeElement;
    const row =
      active instanceof Element
        ? active.closest<HTMLElement>(`.${styles.fileRow}`)
        : null;
    if (!row || !sidebarRef.current) return;
    const buttons = Array.from(
      sidebarRef.current.querySelectorAll<HTMLButtonElement>(
        `.${styles.fileMainButton}`,
      ),
    );
    const current = row.querySelector<HTMLButtonElement>(`.${styles.fileMainButton}`);
    const index = current ? buttons.indexOf(current) : -1;
    if (index < 0) return;
    const file = props.files.find((item) => item.id === row.dataset.fileId);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = Math.min(index + 1, buttons.length - 1);
    else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'Enter' && file) {
      event.preventDefault();
      props.onView(file);
      return;
    } else if (event.key === 'Delete' && file) {
      event.preventDefault();
      props.onDelete(file);
      return;
    } else if (event.key === 'F2' && file) {
      event.preventDefault();
      props.onRename(file);
      return;
    } else return;
    event.preventDefault();
    const target = buttons[next];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <aside
      ref={sidebarRef}
      className={styles.sidebar}
      onKeyDown={onKeyDown}
      aria-label="Файлы"
    >
      {visible.map((section, index) => (
        <SectionBlock
          key={section}
          {...props}
          section={section}
          sectionFiles={filesOfSection(props.files, section)}
          weight={props.weights[section] ?? 1}
          previous={index > 0 ? (visible[index - 1] ?? null) : null}
        />
      ))}
    </aside>
  );
}

interface SectionBlockProps extends FilePanelProps {
  section: SectionId;
  sectionFiles: AnalyzerFile[];
  weight: number;
  previous: SectionId | null;
}

function SectionBlock({
  section,
  sectionFiles: files,
  weight,
  previous,
  ...props
}: SectionBlockProps) {
  const spec = SECTIONS[section];
  const [dragOver, setDragOver] = useState(false);
  const depth = useRef(0);

  const dragEnter = (event: DragEvent) => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    depth.current += 1;
    setDragOver(true);
  };
  const dragOverHandler = (event: DragEvent) => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const dragLeave = (event: DragEvent) => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragOver(false);
  };
  const drop = (event: DragEvent) => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    depth.current = 0;
    setDragOver(false);
    // webkitGetAsEntry работает только синхронно внутри drop
    const entries: FileSystemEntry[] = [];
    for (const item of Array.from(event.dataTransfer.items ?? [])) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    props.onDrop(section, entries, Array.from(event.dataTransfer.files ?? []));
  };

  return (
    <>
      {previous && (
        <SectionResizer
          before={previous}
          after={section}
          onWeights={props.onWeights}
          onCommit={props.onCommitWeights}
          onResizing={props.onResizing}
        />
      )}
      <section
        className={styles.fileSection}
        data-section={section}
        style={{ flexGrow: weight }}
        onDragEnter={dragEnter}
        onDragOver={dragOverHandler}
        onDragLeave={dragLeave}
        onDrop={drop}
      >
        <div className={styles.paneTitle}>
          <span className={styles.paneName}>
            {spec.title} <span className={styles.paneCount}>{files.length}</span>
          </span>
          <div className={styles.paneActions}>
            <button
              type="button"
              title="Загрузить файлы с диска"
              aria-label={`Загрузить в ${spec.title}`}
              onClick={() => props.onImport(section)}
            >
              <Icon name="upload" size={16} />
            </button>
            {section === 'html' && (
              <button
                type="button"
                title="Преобразовать все HTML в TXT"
                aria-label="Преобразовать все HTML в TXT"
                disabled={files.length === 0}
                onClick={props.onConvert}
              >
                <Icon name="convert" size={16} />
              </button>
            )}
            <button
              type="button"
              title="Скачать секцию одним ZIP"
              aria-label={`Скачать ${spec.title} в ZIP`}
              disabled={files.length === 0}
              onClick={() => props.onExport(section)}
            >
              <Icon name="download" size={16} />
            </button>
            <button
              type="button"
              className={styles.danger}
              title="Очистить секцию"
              aria-label={`Очистить ${spec.title}`}
              disabled={files.length === 0}
              onClick={() => props.onClear(section)}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
        <div
          className={`${styles.fileList} ${dragOver ? styles.dragOver : ''}`}
          role="listbox"
          aria-label={`Файлы ${spec.title}`}
          data-testid={`list-${section}`}
        >
          {files.length === 0 ? (
            <div
              className={styles.dropHint}
              role="button"
              tabIndex={0}
              onClick={() => props.onImport(section)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onImport(section);
                }
              }}
            >
              Перетащите сюда
              <strong>{spec.accept.join(', ')}-файлы или папки</strong>
              или нажмите, чтобы выбрать
            </div>
          ) : (
            files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                active={file.id === props.activeFileId}
                {...props}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

function FileRow({
  file,
  active,
  ...props
}: { file: AnalyzerFile; active: boolean } & Omit<FilePanelProps, 'files'>) {
  const menuRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={`${styles.fileRow} ${active ? styles.fileRowActive : ''}`}
      role="option"
      aria-selected={active}
      data-file-id={file.id}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onMenu(file, event.clientX, event.clientY, menuRef.current);
      }}
    >
      <button
        type="button"
        className={styles.fileMainButton}
        title={file.name}
        onClick={() => props.onOpen(file)}
        onDoubleClick={() => props.onView(file)}
      >
        <span className={styles.fileIcon}>
          <Icon name="file" />
        </span>
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>{formatSize(file.size)}</span>
      </button>
      <button
        ref={menuRef}
        type="button"
        className={styles.fileMenuButton}
        title="Действия с файлом"
        aria-label={`Действия: ${file.name}`}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          props.onMenu(file, rect.right + 4, rect.top, event.currentTarget);
        }}
      >
        <Icon name="menu" />
      </button>
    </div>
  );
}

function SectionResizer({
  before,
  after,
  onWeights,
  onCommit,
  onResizing,
}: {
  before: SectionId;
  after: SectionId;
  onWeights: (weights: Partial<Record<SectionId, number>>) => void;
  onCommit: () => void;
  onResizing: (resizing: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const heights = useCallback(
    (node: HTMLElement) => {
      const sidebar = node.parentElement;
      const h = (section: SectionId) =>
        sidebar
          ?.querySelector<HTMLElement>(`[data-section="${section}"]`)
          ?.getBoundingClientRect().height ?? 0;
      return { h1: h(before), h2: h(after) };
    },
    [after, before],
  );
  const apply = useCallback(
    (h1: number, h2: number) => {
      const total = h1 + h2;
      const next = Math.max(72, Math.min(total - 72, h1));
      onWeights({ [before]: next, [after]: total - next });
    },
    [after, before, onWeights],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setActive(true);
    onResizing(true);
    const { h1, h2 } = heights(target);
    const startY = event.clientY;
    const onMove = (move: globalThis.PointerEvent) =>
      apply(h1 + (move.clientY - startY), h2 - (move.clientY - startY));
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setActive(false);
      onResizing(false);
      onCommit();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={`${styles.hResizer} ${active ? styles.resizerActive : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Высота секций ${SECTIONS[before].title} и ${SECTIONS[after].title}`}
      tabIndex={0}
      title="Потяните или измените стрелками; двойной клик — поровну"
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        const { h1, h2 } = heights(event.currentTarget);
        apply((h1 + h2) / 2, (h1 + h2) / 2);
        onCommit();
      }}
      onKeyDown={(event) => {
        const stepSize = event.shiftKey ? 60 : 20;
        const { h1, h2 } = heights(event.currentTarget);
        if (event.key === 'ArrowUp') apply(h1 - stepSize, h2 + stepSize);
        else if (event.key === 'ArrowDown') apply(h1 + stepSize, h2 - stepSize);
        else if (event.key === 'Enter') apply((h1 + h2) / 2, (h1 + h2) / 2);
        else return;
        event.preventDefault();
        onCommit();
      }}
    />
  );
}
