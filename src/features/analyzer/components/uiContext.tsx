// Диалоги, контекстное меню и статусная строка: один контекст на страницу анализатора.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AnalyzerUiContext,
  type AnalyzerUi,
  type ButtonKind,
  type DialogSpec,
  type MenuSpec,
  type StatusState,
} from './uiContextCore';
import styles from '../AnalyzerPage.module.css';

interface DialogState {
  spec: DialogSpec<unknown>;
  resolve: (value: unknown) => void;
}

const UNDO_WINDOW_MS = 12000;

export function AnalyzerUiProvider({
  children,
  onStatus,
}: {
  children: ReactNode;
  onStatus: (status: StatusState | null) => void;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<MenuSpec | null>(null);
  const statusTimer = useRef(0);

  const openDialog = useCallback(
    <T,>(spec: DialogSpec<T>) =>
      new Promise<T | null>((resolve) => {
        setDialog({
          spec: spec as DialogSpec<unknown>,
          resolve: resolve as (value: unknown) => void,
        });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string, okLabel = 'Да', kind: ButtonKind = 'primary') =>
      openDialog<boolean>({
        message,
        buttons: [
          { label: okLabel, value: true, kind },
          { label: 'Отмена', value: false, kind: 'secondary' },
        ],
      }).then((value) => value === true),
    [openDialog],
  );

  const setStatus = useCallback(
    (text: string, options?: { sticky?: boolean; undo?: () => void }) => {
      window.clearTimeout(statusTimer.current);
      onStatus(options?.undo ? { text, undo: options.undo } : { text });
      if (options?.undo)
        statusTimer.current = window.setTimeout(() => onStatus(null), UNDO_WINDOW_MS);
      else if (!options?.sticky)
        statusTimer.current = window.setTimeout(() => onStatus(null), 8000);
    },
    [onStatus],
  );

  const api = useMemo<AnalyzerUi>(
    () => ({ dialog: openDialog, confirm, menu: (spec) => setMenu(spec), setStatus }),
    [confirm, openDialog, setStatus],
  );

  return (
    <AnalyzerUiContext.Provider value={api}>
      {children}
      {dialog && <DialogHost state={dialog} onClose={() => setDialog(null)} />}
      {menu && <MenuHost spec={menu} onClose={() => setMenu(null)} />}
    </AnalyzerUiContext.Provider>
  );
}

function DialogHost({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const finish = useCallback(
    (value: unknown) => {
      onClose();
      state.resolve(value);
    },
    [onClose, state],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = overlayRef.current;
    const focusable = () =>
      Array.from(
        overlay?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((node) => !(node as HTMLButtonElement).disabled);
    const first =
      overlay?.querySelector<HTMLElement>('input, textarea, select') ??
      overlay?.querySelector<HTMLElement>(`.${styles.primary}`) ??
      focusable()[0];
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode?.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [finish]);

  const kindClass = (kind: ButtonKind = 'secondary') =>
    kind === 'danger' ? styles.dangerButton : styles[kind];
  return (
    <div
      ref={overlayRef}
      className={styles.dialogOverlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) finish(null);
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        {state.spec.message && (
          <p className={styles.dialogMessage}>{state.spec.message}</p>
        )}
        {state.spec.body && <div className={styles.dialogBody}>{state.spec.body}</div>}
        <div className={styles.dialogButtons}>
          {state.spec.buttons.map((button) => (
            <button
              key={button.label}
              type="button"
              className={`${styles.button} ${kindClass(button.kind)}`}
              onClick={() =>
                finish(
                  typeof button.value === 'function'
                    ? (button.value as () => unknown)()
                    : button.value,
                )
              }
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuHost({ spec, onClose }: { spec: MenuSpec; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: spec.x, top: spec.y });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(spec.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(spec.y, window.innerHeight - rect.height - 8)),
    });
    node.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!node.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        spec.opener?.focus();
        return;
      }
      const items = Array.from(
        node.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const go = (i: number) => {
        event.preventDefault();
        items[(i + items.length) % items.length]?.focus();
      };
      if (event.key === 'ArrowDown') go(index + 1);
      else if (event.key === 'ArrowUp') go(index - 1);
      else if (event.key === 'Home') go(0);
      else if (event.key === 'End') go(items.length - 1);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, spec]);

  return (
    <div ref={ref} className={styles.contextMenu} role="menu" style={position}>
      {spec.actions.map((action, index) =>
        action === 'separator' ? (
          <hr key={`sep-${index}`} role="separator" />
        ) : (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            className={action.danger ? styles.menuDanger : undefined}
            disabled={!action.onSelect}
            onClick={() => {
              onClose();
              action.onSelect?.();
            }}
          >
            {action.label}
          </button>
        ),
      )}
    </div>
  );
}
