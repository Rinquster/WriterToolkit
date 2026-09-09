// Полоса вкладок инструкций: прокрутка, клавиатура, перетаскивание, быстрое добавление.
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type WheelEvent,
} from 'react';
import type { Instruction } from '../core/config';
import styles from '../AnalyzerPage.module.css';
import Icon from './icons';

export type TabStatus = 'error' | 'pending' | null;

export interface TabsBarProps {
  instructions: readonly Instruction[];
  activeId: string;
  status: Record<string, TabStatus>;
  onSelect: (id: string) => void;
  onMenu: (
    instruction: Instruction,
    x: number,
    y: number,
    opener: HTMLElement | null,
  ) => void;
  onDelete: (id: string) => void;
  onReorder: (movedId: string, targetId: string, place: 'before' | 'after') => void;
  onAdd: (opener: HTMLElement) => void;
  onQuickAdd: (query: string) => void;
}

const TAB_DND_TYPE = 'application/x-writertoolkit-analyzer-tab';

export default function TabsBar(props: TabsBarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: 'before' | 'after' } | null>(
    null,
  );

  useEffect(() => {
    hostRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [props.activeId]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (
      !host ||
      event.deltaY === 0 ||
      event.deltaX !== 0 ||
      host.scrollWidth <= host.clientWidth
    )
      return;
    host.scrollLeft += event.deltaY;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) return;
    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'Delete') {
      event.preventDefault();
      const id = tabs[index]?.dataset.instructionId;
      if (id) props.onDelete(id);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    target?.focus();
    if (target?.dataset.instructionId) props.onSelect(target.dataset.instructionId);
  };

  const placeFor = (
    node: HTMLElement,
    clientX: number,
    id: string,
  ): 'before' | 'after' => {
    if (id === 'chars') return 'after';
    const rect = node.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  };

  return (
    <div className={styles.tabsBar}>
      <div
        ref={hostRef}
        className={styles.tabs}
        role="tablist"
        aria-label="Инструкции"
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        data-testid="analyzer-tabs"
      >
        {props.instructions.map((instruction) => {
          const status = props.status[instruction.id] ?? null;
          const active = instruction.id === props.activeId;
          const classes = [styles.tab];
          if (!instruction.enabled) classes.push(styles.tabDisabled);
          if (status === 'error') classes.push(styles.tabError);
          if (status === 'pending') classes.push(styles.tabPending);
          if (dragged === instruction.id) classes.push(styles.tabDragging);
          if (drop?.id === instruction.id)
            classes.push(
              drop.place === 'before' ? styles.dropBefore : styles.dropAfter,
            );
          return (
            <button
              key={instruction.id}
              type="button"
              role="tab"
              className={classes.join(' ')}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={instruction.description}
              data-instruction-id={instruction.id}
              draggable={instruction.type !== 'chars'}
              onClick={() => props.onSelect(instruction.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                props.onMenu(
                  instruction,
                  event.clientX,
                  event.clientY,
                  event.currentTarget,
                );
              }}
              onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                if (instruction.type === 'chars') {
                  event.preventDefault();
                  return;
                }
                setDragged(instruction.id);
                event.dataTransfer.setData(TAB_DND_TYPE, instruction.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragged(null);
                setDrop(null);
              }}
              onDragOver={(event) => {
                if (!dragged || dragged === instruction.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDrop({
                  id: instruction.id,
                  place: placeFor(event.currentTarget, event.clientX, instruction.id),
                });
              }}
              onDrop={(event) => {
                if (!dragged || dragged === instruction.id) return;
                event.preventDefault();
                const place = placeFor(
                  event.currentTarget,
                  event.clientX,
                  instruction.id,
                );
                props.onReorder(dragged, instruction.id, place);
                setDragged(null);
                setDrop(null);
              }}
            >
              {status && <span className={styles.tabDot} aria-hidden="true" />}
              <span>{instruction.title}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.tabsTools}>
        <button
          type="button"
          className={styles.tabAdd}
          title="Добавить инструкцию: пустую, из шаблона или списком"
          aria-label="Добавить инструкцию"
          aria-haspopup="menu"
          onClick={(event) => props.onAdd(event.currentTarget)}
        >
          <Icon name="plus" size={16} />
        </button>
        <input
          className={styles.quickAdd}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Быстрая регулярка… Enter"
          aria-label="Быстро добавить инструкцию-регулярку"
          title="Введите подстроку или регулярку и нажмите Enter — появится новая вкладка"
          onKeyDown={(event) => {
            const input = event.currentTarget;
            if (event.key === 'Enter') {
              event.preventDefault();
              props.onQuickAdd(input.value);
              input.value = '';
            } else if (event.key === 'Escape') {
              input.value = '';
              input.blur();
            }
          }}
        />
      </div>
    </div>
  );
}
