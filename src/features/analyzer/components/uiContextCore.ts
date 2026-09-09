// Контекст интерфейса анализатора: типы, хук и сам контекст (без компонентов — ради fast refresh).
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type ButtonKind = 'primary' | 'secondary' | 'danger';

export interface DialogButton<T> {
  label: string;
  kind?: ButtonKind;
  value: T | (() => T);
}

export interface DialogSpec<T> {
  message: string;
  body?: ReactNode;
  buttons: DialogButton<T>[];
}

export type MenuAction =
  { label: string; onSelect?: () => void; danger?: boolean } | 'separator';

export interface MenuSpec {
  actions: MenuAction[];
  x: number;
  y: number;
  opener?: HTMLElement | null;
}

export interface AnalyzerUi {
  dialog<T>(spec: DialogSpec<T>): Promise<T | null>;
  confirm(message: string, okLabel?: string, kind?: ButtonKind): Promise<boolean>;
  menu(spec: MenuSpec): void;
  setStatus(text: string, options?: { sticky?: boolean; undo?: () => void }): void;
}

export interface StatusState {
  text: string;
  undo?: () => void;
}

export const AnalyzerUiContext = createContext<AnalyzerUi | null>(null);

export function useAnalyzerUi(): AnalyzerUi {
  const value = useContext(AnalyzerUiContext);
  if (!value) throw new Error('AnalyzerUiProvider отсутствует');
  return value;
}
