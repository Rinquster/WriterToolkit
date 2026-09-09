// Типы состояния анализатора.
import type { AnalyzerConfig } from './core/config';

export type SectionId = 'html' | 'txt' | 'md';

export interface SectionSpec {
  id: SectionId;
  title: string;
  role: 'source' | 'text';
  accept: readonly string[];
  always: boolean;
}

export const SECTIONS: Record<SectionId, SectionSpec> = {
  html: {
    id: 'html',
    title: 'HTML',
    role: 'source',
    accept: ['.html', '.htm', '.txt'],
    always: true,
  },
  txt: { id: 'txt', title: 'TXT', role: 'text', accept: ['.txt'], always: true },
  md: {
    id: 'md',
    title: 'MD',
    role: 'text',
    accept: ['.md', '.markdown'],
    always: false,
  },
};

export const SECTION_ORDER: readonly SectionId[] = ['html', 'txt', 'md'];

export interface AnalyzerFile {
  id: string;
  section: SectionId;
  name: string;
  content: string;
  size: number;
  addedAt: number;
  updatedAt: number;
}

export interface SortSpec {
  key: 'name' | 'value' | 'derived' | 'per1000';
  dir: 'asc' | 'desc';
}

export interface UiState {
  activeTab: string;
  sort: Record<string, SortSpec>;
  barTarget: Record<string, string>;
  sections: { md: boolean };
  sectionWeights: Partial<Record<SectionId, number>>;
}

export interface WorkspaceMeta {
  config: AnalyzerConfig;
  ui: UiState;
}

export function extensionOf(name: string): string {
  const match = /\.[^.]+$/.exec(String(name || '').toLowerCase());
  return match ? match[0] : '';
}

/** Куда попадёт файл с таким именем, брошенный на секцию; null — пропустить. */
export function targetSection(
  section: SectionId,
  name: string,
  mdEnabled: boolean,
): SectionId | null {
  const ext = extensionOf(name);
  if (SECTIONS[section].accept.includes(ext)) return section;
  if (section === 'txt' && SECTIONS.md.accept.includes(ext) && !mdEnabled) return 'txt';
  return null;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

export function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} зн.`;
  return `${Math.round(chars / 1024)} К`;
}

export function filesOfSection(
  files: readonly AnalyzerFile[],
  section: SectionId,
): AnalyzerFile[] {
  return files
    .filter((file) => file.section === section)
    .sort((a, b) => naturalCompare(a.name, b.name));
}

export function uidFile(): string {
  return `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
