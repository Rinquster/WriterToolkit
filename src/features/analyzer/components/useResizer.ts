// Перетаскиваемый делитель: мышь, стрелки, двойной клик — сброс.
import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';

export interface ResizerOptions {
  value: number;
  min: number;
  max: number;
  fallback: number;
  /** Как считать новое значение из позиции указателя. */
  fromPointer: (
    event: PointerEvent<HTMLElement>,
    start: { x: number; y: number; value: number },
  ) => number;
  /** Направление стрелок: какая клавиша увеличивает значение. */
  increaseKey: 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp';
  onChange: (value: number) => void;
  onCommit: () => void;
  onDragState?: (dragging: boolean) => void;
}

export function useResizer(options: ResizerOptions) {
  const {
    value,
    min,
    max,
    fallback,
    fromPointer,
    increaseKey,
    onChange,
    onCommit,
    onDragState,
  } = options;
  const clamp = useCallback(
    (next: number) => Math.max(min, Math.min(max, Math.round(next))),
    [max, min],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      onDragState?.(true);
      const start = { x: event.clientX, y: event.clientY, value };
      const onMove = (moveEvent: PointerEvent<HTMLElement>) =>
        onChange(clamp(fromPointer(moveEvent, start)));
      const onUp = () => {
        target.removeEventListener('pointermove', onMove as unknown as EventListener);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
        onDragState?.(false);
        onCommit();
      };
      target.addEventListener('pointermove', onMove as unknown as EventListener);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [clamp, fromPointer, onChange, onCommit, onDragState, value],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const stepSize = event.shiftKey ? 40 : 10;
      const opposite: Record<string, string> = {
        ArrowRight: 'ArrowLeft',
        ArrowLeft: 'ArrowRight',
        ArrowDown: 'ArrowUp',
        ArrowUp: 'ArrowDown',
      };
      let next = value;
      if (event.key === increaseKey) next += stepSize;
      else if (event.key === opposite[increaseKey]) next -= stepSize;
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      else if (event.key === 'Enter') next = fallback;
      else return;
      event.preventDefault();
      onChange(clamp(next));
      onCommit();
    },
    [clamp, fallback, increaseKey, max, min, onChange, onCommit, value],
  );

  const onDoubleClick = useCallback(() => {
    onChange(fallback);
    onCommit();
  }, [fallback, onChange, onCommit]);

  return { onPointerDown, onKeyDown, onDoubleClick };
}
