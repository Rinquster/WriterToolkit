// Анализатор: сравнительный анализ серии текстов по инструкциям-регуляркам.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppHeaderContent from '../../design-system/components/AppHeaderContent';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { downloadTextFile } from '../../infrastructure/files/download';
import {
  AnalysisClient,
  type AnalyzableFile,
  type PairResult,
} from './analysis/analysisClient';
import { perThousand } from './core/bars';
import {
  CHARS_ID,
  PRESETS,
  defaultConfig,
  instructionFromPreset,
  newInstruction,
  normalizeConfig,
  parseConfigText,
  serializeConfig,
  type AnalyzerConfig,
  type Instruction,
} from './core/config';
import { cleanBasenameFor, cleanTextLegacy, htmlToText } from './core/htmlToText';
import {
  REGEX_DEFAULTS,
  looksLikeRegexSyntax,
  type InstructionType,
  type RegexParams,
} from './core/instructions';
import { applySquareBrackets, hitsReport } from './core/text';
import { safeName } from './core/tsv';
import { analyzerRepository } from './data/analyzerRepository';
import {
  SECTIONS,
  SECTION_ORDER,
  filesOfSection,
  naturalCompare,
  targetSection,
  uidFile,
  type AnalyzerFile,
  type SectionId,
  type SortSpec,
  type UiState,
} from './model';
import FilePanel from './components/FilePanel';
import Inspector from './components/Inspector';
import ResultsTable, {
  type TableModel,
  type TableRow,
} from './components/ResultsTable';
import { tableToTsv } from './components/tableTsv';
import TabsBar, { type TabStatus } from './components/TabsBar';
import TextViewer from './components/TextViewer';
import Icon from './components/icons';
import { AnalyzerUiProvider } from './components/uiContext';
import { useAnalyzerUi, type StatusState } from './components/uiContextCore';
import { useResizer } from './components/useResizer';
import styles from './AnalyzerPage.module.css';

const SETTINGS_KEY = 'writertoolkit-analyzer-settings';
const SIDEBAR = { min: 210, max: 520, fallback: 300 };
const INSPECTOR = { min: 260, max: 640, fallback: 320 };
const ANALYSIS_DELAY_MS = 250;
const PROGRESS_SHOW_MS = 300;
const READ_BATCH = 12;
const BULK_DROP_ASK = 400;

interface Settings {
  sidebarWidth: number;
  inspectorWidth: number;
  inspector: boolean;
  inspectorTab: 'form' | 'hits';
  editorMode: 'form' | 'json';
}

const defaultSettings: Settings = {
  sidebarWidth: 300,
  inspectorWidth: 320,
  inspector: false,
  inspectorTab: 'form',
  editorMode: 'form',
};

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sidebarWidth: clamp(
        Number(parsed.sidebarWidth) || SIDEBAR.fallback,
        SIDEBAR.min,
        SIDEBAR.max,
      ),
      inspectorWidth: clamp(
        Number(parsed.inspectorWidth) || INSPECTOR.fallback,
        INSPECTOR.min,
        INSPECTOR.max,
      ),
      inspector: Boolean(parsed.inspector),
      inspectorTab: parsed.inspectorTab === 'hits' ? 'hits' : 'form',
      editorMode: parsed.editorMode === 'json' ? 'json' : 'form',
    };
  } catch {
    return defaultSettings;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const defaultUi = (): UiState => ({
  activeTab: CHARS_ID,
  sort: {},
  barTarget: {},
  sections: { md: false },
  sectionWeights: {},
});

function isUiState(value: unknown): value is UiState {
  return typeof value === 'object' && value !== null && 'activeTab' in value;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('file read failed')),
    );
    reader.readAsText(file, 'utf-8');
  });
}

/** Разворачивает брошенные записи (файлы и папки) в плоский список File. */
async function collectDroppedFiles(entries: FileSystemEntry[]): Promise<File[]> {
  const collected: File[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      collected.push(file);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      for (const child of batch) await walk(child);
    } while (batch.length > 0);
  }
  for (const entry of entries) {
    try {
      await walk(entry);
    } catch {
      /* недоступная запись */
    }
  }
  return collected;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function AnalyzerPage() {
  useDocumentTitle('Анализатор');
  const [status, setStatusState] = useState<StatusState | null>(null);
  return (
    <AnalyzerUiProvider onStatus={setStatusState}>
      <AnalyzerWorkspace status={status} />
    </AnalyzerUiProvider>
  );
}

function AnalyzerWorkspace({ status }: { status: StatusState | null }) {
  const ui = useAnalyzerUi();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [files, setFiles] = useState<Record<string, AnalyzerFile>>({});
  const [config, setConfig] = useState<AnalyzerConfig>(defaultConfig);
  const [uiState, setUiState] = useState<UiState>(defaultUi);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{
    fileId: string;
    instructionId: string | null;
    index: number;
  } | null>(null);
  const [jsonDraft, setJsonDraft] = useState<{
    text: string;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [resizingCols, setResizingCols] = useState(false);
  const [resizingRows, setResizingRows] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const analysisTimer = useRef(0);

  // ---------- настройки ----------
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* нет места */
      }
      return next;
    });
  }, []);

  // ---------- расчёт ----------
  const [analysis] = useState(() => {
    // таймер показа прогресса живёт в замыкании клиента, а не в ref: инициализатор выполняется при рендере
    let showTimer = 0;
    const client: AnalysisClient = new AnalysisClient(
      () =>
        new Worker(new URL('./analysis/worker.ts', import.meta.url), {
          type: 'module',
        }),
      {
        onProgress: (value) => {
          setProgress((current) => (current ? value : current));
          if (!showTimer) {
            showTimer = window.setTimeout(() => {
              showTimer = 0;
              if (client.running) setProgress(value);
            }, PROGRESS_SHOW_MS);
          }
        },
        onResults: () => setResultsVersion((v) => v + 1),
        onDone: ({ pairs, elapsed: ms }) => {
          window.clearTimeout(showTimer);
          showTimer = 0;
          setProgress(null);
          if (pairs > 0) setElapsed(ms);
          setResultsVersion((v) => v + 1);
        },
        onError: (message) => {
          setProgress(null);
          ui.setStatus(message, { sticky: true });
          setResultsVersion((v) => v + 1);
        },
      },
    );
    return client;
  });
  useEffect(() => () => analysis.dispose(), [analysis]);

  const mdEnabled = uiState.sections.md;
  const fileList = useMemo(() => Object.values(files), [files]);
  const analyzedFiles = useMemo(() => {
    const out: AnalyzerFile[] = [];
    for (const section of SECTION_ORDER) {
      if (
        SECTIONS[section].role !== 'text' ||
        !(SECTIONS[section].always || (section === 'md' && mdEnabled))
      )
        continue;
      out.push(...filesOfSection(fileList, section));
    }
    return out;
  }, [fileList, mdEnabled]);

  const runAnalysis = useCallback(
    (force = false) => {
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = 0;
      const list: AnalyzableFile[] = analyzedFiles;
      try {
        analysis.schedule(list, config.instructions, force);
      } catch (error) {
        console.error(error);
        ui.setStatus('Не удалось запустить расчёт', { sticky: true });
      }
      setResultsVersion((v) => v + 1);
    },
    [analysis, analyzedFiles, config.instructions, ui],
  );

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(analysisTimer.current);
    analysisTimer.current = window.setTimeout(
      () => runAnalysis(false),
      ANALYSIS_DELAY_MS,
    );
    return () => window.clearTimeout(analysisTimer.current);
  }, [ready, runAnalysis]);

  // ---------- хранение ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stored, meta] = await Promise.all([
          analyzerRepository.readFiles(),
          analyzerRepository.readMeta(),
        ]);
        if (!active) return;
        setFiles(Object.fromEntries(stored.map((file) => [file.id, file])));
        if (meta && typeof meta === 'object') {
          const record = meta as { config?: unknown; ui?: unknown };
          const check = normalizeConfig(record.config);
          if (check.config) setConfig(check.config);
          if (isUiState(record.ui)) setUiState({ ...defaultUi(), ...record.ui });
        }
      } catch (error) {
        console.error(error);
        ui.setStatus('Хранилище недоступно: данные не сохранятся', { sticky: true });
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ui]);

  const persistFiles = useCallback(
    (put: AnalyzerFile[], remove: string[]) => {
      analyzerRepository.writeFiles(put, remove).catch((error: unknown) => {
        console.error(error);
        ui.setStatus('Не удалось сохранить в браузере', { sticky: true });
      });
    },
    [ui],
  );

  const metaTimer = useRef(0);
  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(metaTimer.current);
    metaTimer.current = window.setTimeout(() => {
      analyzerRepository
        .writeMeta({ config, ui: uiState })
        .catch((error: unknown) => console.error(error));
    }, 300);
    return () => window.clearTimeout(metaTimer.current);
  }, [config, uiState, ready]);

  // ---------- конфиг ----------
  const activeTab = config.instructions.some((i) => i.id === uiState.activeTab)
    ? uiState.activeTab
    : (config.instructions[0]?.id ?? CHARS_ID);
  const activeInstruction = config.instructions.find((i) => i.id === activeTab) ?? null;

  const updateConfig = useCallback(
    (updater: (current: AnalyzerConfig) => AnalyzerConfig) => {
      setConfig((current) => {
        const next = updater(current);
        analysis.prune(next.instructions);
        return next;
      });
      setJsonDraft(null);
    },
    [analysis],
  );

  const patchInstruction = (id: string, patch: Partial<Instruction>) =>
    updateConfig((current) => ({
      ...current,
      instructions: current.instructions.map((i) =>
        i.id === id
          ? {
              ...i,
              ...patch,
              enabled: i.type === 'chars' ? true : (patch.enabled ?? i.enabled),
            }
          : i,
      ),
    }));
  const patchParams = (id: string, patch: Partial<RegexParams>) =>
    updateConfig((current) => ({
      ...current,
      instructions: current.instructions.map((i) =>
        i.id === id ? { ...i, params: { ...i.params, ...patch } } : i,
      ),
    }));

  const pushInstructions = (list: Instruction[], openForm = false) => {
    if (!list.length) return;
    updateConfig((current) => ({
      ...current,
      instructions: [...current.instructions, ...list],
    }));
    const last = list[list.length - 1];
    if (last) setUiState((current) => ({ ...current, activeTab: last.id }));
    if (openForm)
      updateSettings({ inspector: true, inspectorTab: 'form', editorMode: 'form' });
  };

  const instructionFromQuery = (
    query: string,
    mode: 'auto' | 'literal' | 'regex',
    caseSensitive = false,
  ): Instruction => {
    const resolved =
      mode === 'auto' ? (looksLikeRegexSyntax(query) ? 'regex' : 'literal') : mode;
    const title = query.length > 40 ? `${query.slice(0, 39)}…` : query;
    return newInstruction('regex', {
      title,
      params: { ...REGEX_DEFAULTS, query, mode: resolved, caseSensitive },
    });
  };

  const quickAdd = (query: string) => {
    const text = query.trim();
    if (!text) return;
    const instruction = instructionFromQuery(text, 'auto');
    pushInstructions([instruction]);
    ui.setStatus(
      `Добавлена инструкция: ${instruction.title} (${instruction.params.mode === 'regex' ? 'регулярка' : 'подстрока'})`,
    );
  };

  const addQueryList = async () => {
    const areaRef = { current: null as HTMLTextAreaElement | null };
    const modeRef = { current: null as HTMLSelectElement | null };
    const caseRef = { current: null as HTMLInputElement | null };
    const ok = await ui.dialog<boolean>({
      message: 'Добавить список инструкций-регулярок',
      body: (
        <div>
          <textarea
            ref={(node) => {
              areaRef.current = node;
            }}
            className={`${styles.formTextarea} ${styles.mono}`}
            style={{ minHeight: 180 }}
            spellCheck={false}
            placeholder={
              'по одному запросу на строку\n# строки с решёткой пропускаются'
            }
            aria-label="Список запросов"
          />
          <div className={styles.formRow} style={{ marginTop: 10 }}>
            <select
              ref={(node) => {
                modeRef.current = node;
              }}
              className={styles.formSelect}
              aria-label="Режим"
              defaultValue="auto"
            >
              <option value="auto">Режим: автоматически</option>
              <option value="literal">Режим: подстрока</option>
              <option value="regex">Режим: регулярка</option>
            </select>
          </div>
          <label className={styles.formCheck}>
            <input
              ref={(node) => {
                caseRef.current = node;
              }}
              type="checkbox"
            />
            Учитывать регистр
          </label>
        </div>
      ),
      buttons: [
        { label: 'Добавить', value: true, kind: 'primary' },
        { label: 'Отмена', value: false, kind: 'secondary' },
      ],
    });
    if (!ok) return;
    const lines = (areaRef.current?.value ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const mode = (modeRef.current?.value ?? 'auto') as 'auto' | 'literal' | 'regex';
    const list = lines.map((line) =>
      instructionFromQuery(line, mode, Boolean(caseRef.current?.checked)),
    );
    pushInstructions(list);
    ui.setStatus(list.length ? `Добавлено инструкций: ${list.length}` : 'Список пуст');
  };

  const openAddMenu = (opener: HTMLElement) => {
    const rect = opener.getBoundingClientRect();
    ui.menu({
      x: rect.left,
      y: rect.bottom + 6,
      opener,
      actions: [
        {
          label: 'Новая регулярка',
          onSelect: () =>
            pushInstructions(
              [newInstruction('regex', { title: 'Новая инструкция' })],
              true,
            ),
        },
        { label: 'Добавить список запросов…', onSelect: () => void addQueryList() },
        'separator',
        ...PRESETS.map((preset) => ({
          label: `Шаблон: ${preset.title}`,
          onSelect: () => {
            pushInstructions([instructionFromPreset(preset)]);
            ui.setStatus(`Добавлен шаблон: ${preset.title}`);
          },
        })),
      ],
    });
  };

  const deleteInstruction = async (id: string) => {
    const instruction = config.instructions.find((i) => i.id === id);
    if (!instruction || instruction.type === 'chars') return;
    if (
      !(await ui.confirm(
        `Удалить инструкцию «${instruction.title}»?`,
        'Удалить',
        'danger',
      ))
    )
      return;
    const index = config.instructions.indexOf(instruction);
    updateConfig((current) => ({
      ...current,
      instructions: current.instructions.filter((i) => i.id !== id),
    }));
    analysis.drop(id);
    if (activeTab === id)
      setUiState((current) => ({
        ...current,
        activeTab: config.instructions[Math.max(0, index - 1)]?.id ?? CHARS_ID,
      }));
    ui.setStatus(`Удалена инструкция: ${instruction.title}`);
  };

  const duplicateInstruction = (id: string) => {
    const source = config.instructions.find((i) => i.id === id);
    if (!source || source.type === 'chars') return;
    const copy = newInstruction('regex', {
      ...structuredClone(source),
      id: undefined,
      title: `${source.title} (копия)`,
    });
    copy.id = newInstruction('regex').id;
    const index = config.instructions.indexOf(source);
    updateConfig((current) => {
      const next = current.instructions.slice();
      next.splice(index + 1, 0, copy);
      return { ...current, instructions: next };
    });
    setUiState((current) => ({ ...current, activeTab: copy.id }));
  };

  const changeType = (id: string, type: InstructionType) => {
    if (type !== 'regex') return;
    updateConfig((current) => ({
      ...current,
      instructions: current.instructions.map((i) =>
        i.id === id && i.type !== 'chars'
          ? { ...i, type, params: { ...REGEX_DEFAULTS } }
          : i,
      ),
    }));
    analysis.drop(id);
  };

  const reorderInstruction = (
    movedId: string,
    targetId: string,
    place: 'before' | 'after',
  ) => {
    updateConfig((current) => {
      const moved = current.instructions.find((i) => i.id === movedId);
      if (!moved || moved.type === 'chars' || movedId === targetId) return current;
      const rest = current.instructions.filter((i) => i.id !== movedId);
      let index = rest.findIndex((i) => i.id === targetId);
      if (index < 0) return current;
      if (place === 'after') index += 1;
      rest.splice(Math.max(1, index), 0, moved);
      return { ...current, instructions: rest };
    });
  };

  const applyConfig = (next: AnalyzerConfig, message: string) => {
    updateConfig(() => next);
    ui.setStatus(message);
  };

  const importConfigFile = async (file: File) => {
    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      ui.setStatus('Не удалось прочитать файл', { sticky: true });
      return;
    }
    const { config: next, errors, warnings } = parseConfigText(text);
    if (!next) {
      await ui.dialog({
        message: 'Конфиг не загружен:',
        body: (
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ),
        buttons: [{ label: 'Понятно', value: null, kind: 'secondary' }],
      });
      return;
    }
    if (warnings.length) {
      const ok = await ui.dialog<boolean>({
        message: 'Конфиг загружен с замечаниями. Применить?',
        body: (
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ),
        buttons: [
          { label: 'Применить', value: true, kind: 'primary' },
          { label: 'Отмена', value: false, kind: 'secondary' },
        ],
      });
      if (!ok) return;
    }
    applyConfig(next, `Конфиг загружен: инструкций ${next.instructions.length}`);
  };

  const exportConfig = () => {
    downloadTextFile(
      serializeConfig(config),
      `panalyzer-config-${todayStamp()}.json`,
      'application/json;charset=utf-8',
    );
    ui.setStatus('Конфиг выгружен');
  };

  const jsonText = jsonDraft?.text ?? serializeConfig(config);
  const onJsonChange = (text: string) => {
    const { errors, warnings } = parseConfigText(text);
    setJsonDraft({ text, errors, warnings });
  };
  const onJsonApply = () => {
    const { config: next, errors } = parseConfigText(jsonText);
    if (!next || errors.length) return;
    applyConfig(next, 'Конфиг применён');
  };

  // ---------- файлы ----------
  const fileByName = (section: SectionId, name: string) =>
    fileList.find((f) => f.section === section && f.name === name) ?? null;

  const askConflict = (
    name: string,
    many: boolean,
    where: string,
  ): Promise<string | null> =>
    ui.dialog<string>({
      message: `Файл «${name}» уже есть в секции ${where}. Заменить его содержимое?`,
      buttons: [
        { label: 'Заменить', value: 'replace', kind: 'primary' },
        ...(many
          ? [{ label: 'Заменить все', value: 'replace-all', kind: 'primary' as const }]
          : []),
        { label: 'Пропустить', value: 'skip', kind: 'secondary' },
        ...(many
          ? [{ label: 'Пропустить все', value: 'skip-all', kind: 'secondary' as const }]
          : []),
      ],
    });

  const commitFiles = (put: AnalyzerFile[], remove: string[]) => {
    setFiles((current) => {
      const next = { ...current };
      for (const id of remove) delete next[id];
      for (const file of put) next[file.id] = file;
      return next;
    });
    persistFiles(put, remove);
  };

  const importFiles = async (section: SectionId, items: File[]) => {
    if (!items.length) return;
    let skipped = 0;
    const prepared: { name: string; target: SectionId; content: string }[] = [];
    for (let i = 0; i < items.length; i += READ_BATCH) {
      const batch = items.slice(i, i + READ_BATCH);
      const contents = await Promise.all(
        batch.map(async (file) => {
          const target = targetSection(section, file.name, mdEnabled);
          if (!target) return null;
          try {
            return { target, content: await readFileAsText(file) };
          } catch {
            return null;
          }
        }),
      );
      contents.forEach((entry, k) => {
        const source = batch[k];
        if (!entry || !source) skipped += 1;
        else prepared.push({ name: source.name, ...entry });
      });
      if (items.length > READ_BATCH)
        ui.setStatus(
          `Чтение: ${Math.min(i + READ_BATCH, items.length)} из ${items.length}`,
          { sticky: true },
        );
    }
    let bulk: string | null = null;
    const many = prepared.length > 1;
    const put: AnalyzerFile[] = [];
    let loaded = 0;
    const stamp = Date.now();
    for (const item of prepared) {
      const existing =
        fileByName(item.target, item.name) ??
        put.find((f) => f.section === item.target && f.name === item.name) ??
        null;
      if (existing) {
        let answer: string | null = bulk;
        if (!answer) {
          answer = await askConflict(item.name, many, SECTIONS[item.target].title);
          if (answer === 'replace-all' || answer === 'skip-all') bulk = answer;
        }
        if (answer !== 'replace' && answer !== 'replace-all') {
          skipped += 1;
          continue;
        }
        put.push({
          ...existing,
          content: item.content,
          size: item.content.length,
          updatedAt: stamp,
        });
      } else {
        put.push({
          id: uidFile(),
          section: item.target,
          name: item.name,
          content: item.content,
          size: item.content.length,
          addedAt: stamp,
          updatedAt: stamp,
        });
      }
      loaded += 1;
    }
    commitFiles(put, []);
    ui.setStatus(
      `Загружено файлов: ${loaded}${skipped ? `, пропущено: ${skipped}` : ''}`,
    );
  };

  const onDrop = async (
    section: SectionId,
    entries: FileSystemEntry[],
    plain: File[],
  ) => {
    try {
      let list = plain;
      if (entries.length > 0) {
        list = await collectDroppedFiles(entries);
        if (
          list.length > BULK_DROP_ASK &&
          !(await ui.confirm(
            `В брошенных папках ${list.length} файлов. Загрузить их все?`,
            'Загрузить',
          ))
        ) {
          ui.setStatus('Загрузка отменена');
          return;
        }
      }
      await importFiles(section, list);
    } catch (error) {
      console.error(error);
      ui.setStatus('Не удалось загрузить файлы', { sticky: true });
    }
  };

  const pickFiles = (section: SectionId) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept =
      SECTIONS[section].accept.join(',') +
      (section === 'txt' && !mdEnabled ? ',.md' : '');
    input.dataset.section = section;
    input.value = '';
    input.click();
  };

  const removeFiles = (list: AnalyzerFile[], message: string) => {
    if (!list.length) return;
    const snapshot = list.map((f) => ({ ...f }));
    for (const file of list) analysis.forget(file.id);
    if (list.some((f) => f.id === activeFileId)) setActiveFileId(null);
    if (viewer && list.some((f) => f.id === viewer.fileId)) setViewer(null);
    commitFiles(
      [],
      snapshot.map((f) => f.id),
    );
    ui.setStatus(message, {
      undo: () => {
        commitFiles(snapshot, []);
        ui.setStatus(`Возвращено файлов: ${snapshot.length}`);
      },
    });
  };

  const clearSection = async (section: SectionId) => {
    const list = filesOfSection(fileList, section);
    if (!list.length) return;
    if (
      !(await ui.confirm(
        `Удалить все файлы секции ${SECTIONS[section].title} (${list.length})? Можно будет отменить в течение 12 секунд.`,
        'Удалить',
        'danger',
      ))
    )
      return;
    removeFiles(list, `Удалено из ${SECTIONS[section].title}: ${list.length}`);
  };

  const renameFile = async (file: AnalyzerFile) => {
    const inputRef = { current: null as HTMLInputElement | null };
    const answer = await ui.dialog<string>({
      message: 'Новое имя файла:',
      body: (
        <input
          ref={(node) => {
            inputRef.current = node;
          }}
          className={styles.formInput}
          type="text"
          defaultValue={file.name}
          aria-label="Новое имя"
        />
      ),
      buttons: [
        {
          label: 'Переименовать',
          value: () => inputRef.current?.value.trim() ?? '',
          kind: 'primary',
        },
        { label: 'Отмена', value: '', kind: 'secondary' },
      ],
    });
    if (!answer || answer === file.name) return;
    if (/[\\/]/.test(answer)) {
      ui.setStatus('Имя не может содержать косую черту', { sticky: true });
      return;
    }
    const clash = fileByName(file.section, answer);
    if (clash && clash.id !== file.id) {
      ui.setStatus(`Файл «${answer}» уже есть в секции`, { sticky: true });
      return;
    }
    commitFiles([{ ...file, name: answer, updatedAt: Date.now() }], []);
    ui.setStatus(`Переименовано: ${answer}`);
  };

  const exportSection = async (section: SectionId) => {
    const list = filesOfSection(fileList, section);
    if (!list.length) return;
    ui.setStatus('Готовим архив…', { sticky: true });
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const file of list) zip.file(file.name, file.content);
    downloadBlob(
      await zip.generateAsync({ type: 'blob' }),
      `panalyzer-${section}-${todayStamp()}.zip`,
    );
    ui.setStatus(`В архиве файлов: ${list.length}`);
  };

  const convertHtml = async () => {
    const list = filesOfSection(fileList, 'html');
    if (!list.length) return;
    const results = list.map((file) => ({
      name: cleanBasenameFor(file.name),
      content: /\.html?$/i.test(file.name)
        ? htmlToText(file.content)
        : cleanTextLegacy(file.content),
    }));
    const conflicts = results.filter((r) => fileByName('txt', r.name));
    let mode = 'replace-all';
    if (conflicts.length) {
      const answer = await ui.dialog<string>({
        message: `${conflicts.length} файлов с такими именами уже есть в TXT. Заменить?`,
        buttons: [
          { label: 'Заменить все', value: 'replace-all', kind: 'primary' },
          { label: 'Пропустить все', value: 'skip-all', kind: 'secondary' },
          { label: 'Решать по каждому', value: 'each', kind: 'secondary' },
          { label: 'Отмена', value: '', kind: 'secondary' },
        ],
      });
      if (!answer) return;
      mode = answer;
    }
    let converted = 0;
    let replaced = 0;
    let skipped = 0;
    let bulk: string | null = mode === 'each' ? null : mode;
    const put: AnalyzerFile[] = [];
    const stamp = Date.now();
    for (const r of results) {
      const existing = fileByName('txt', r.name);
      if (existing) {
        let answer: string | null = bulk;
        if (!answer) {
          answer = await askConflict(r.name, conflicts.length > 1, 'TXT');
          if (answer === 'replace-all' || answer === 'skip-all') bulk = answer;
        }
        if (answer !== 'replace' && answer !== 'replace-all') {
          skipped += 1;
          continue;
        }
        replaced += 1;
        put.push({
          ...existing,
          content: r.content,
          size: r.content.length,
          updatedAt: stamp,
        });
      } else {
        put.push({
          id: uidFile(),
          section: 'txt',
          name: r.name,
          content: r.content,
          size: r.content.length,
          addedAt: stamp,
          updatedAt: stamp,
        });
      }
      converted += 1;
    }
    commitFiles(put, []);
    ui.setStatus(
      `Преобразовано: ${converted}, заменено: ${replaced}, пропущено: ${skipped}`,
    );
  };

  const openViewer = (fileId: string, instructionId: string | null, index = 0) => {
    setViewer({ fileId, instructionId, index });
    setActiveFileId(fileId);
  };

  const selectFile = (fileId: string, showHits: boolean) => {
    setActiveFileId(fileId);
    if (showHits) updateSettings({ inspector: true, inspectorTab: 'hits' });
  };

  const openFileMenu = (
    file: AnalyzerFile,
    x: number,
    y: number,
    opener: HTMLElement | null,
  ) => {
    const isText = SECTIONS[file.section].role === 'text';
    ui.menu({
      x,
      y,
      opener,
      actions: [
        {
          label: 'Открыть текст',
          onSelect: () => openViewer(file.id, isText ? activeTab : null),
        },
        { label: 'Переименовать', onSelect: () => void renameFile(file) },
        {
          label: 'Скачать',
          onSelect: () =>
            downloadTextFile(file.content, file.name, 'text/plain;charset=utf-8'),
        },
        'separator',
        {
          label: 'Удалить',
          danger: true,
          onSelect: () => removeFiles([file], `Удалено: ${file.name}`),
        },
      ],
    });
  };

  // ---------- таблица ----------
  const tableModel = useMemo<TableModel | null>(() => {
    void resultsVersion;
    const instruction = activeInstruction;
    if (!instruction) return null;
    const multi =
      SECTION_ORDER.filter(
        (s) =>
          SECTIONS[s].role === 'text' &&
          (SECTIONS[s].always || (s === 'md' && mdEnabled)),
      ).length > 1;
    const showDerived = Number(instruction.barDivisor) !== 1;
    const rows: TableRow[] = analyzedFiles.map((file) => {
      const result = analysis.get(instruction.id, file.id);
      const chars = analysis.get(CHARS_ID, file.id);
      const value = result && typeof result.value === 'number' ? result.value : null;
      return {
        fileId: file.id,
        name: file.name,
        prefix: multi ? SECTIONS[file.section].title : '',
        value,
        derived: value === null ? null : value / instruction.barDivisor,
        per1000:
          instruction.type === 'chars'
            ? null
            : value === null || !chars
              ? undefined
              : perThousand(
                  value,
                  typeof chars.value === 'number' ? chars.value : null,
                ),
        error: result?.error ?? (!instruction.enabled ? 'инструкция выключена' : null),
        pending: !result && instruction.enabled,
      };
    });
    const sort = uiState.sort[instruction.id] ?? null;
    if (sort) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        if (sort.key === 'name')
          return dir * naturalCompare(a.prefix + a.name, b.prefix + b.name);
        const av = a[sort.key];
        const bv = b[sort.key];
        const aNone = av === null || av === undefined;
        const bNone = bv === null || bv === undefined;
        if (aNone && bNone) return 0;
        if (aNone) return 1;
        if (bNone) return -1;
        return dir * ((av as number) - (bv as number));
      });
    }
    return {
      instruction,
      rows,
      showDerived,
      derivedTitle: instruction.derivedTitle || 'Значение / делитель',
      showPer1000: instruction.type !== 'chars',
      barTarget:
        uiState.barTarget[instruction.id] ?? (showDerived ? 'derived' : 'value'),
      sort,
      clickable: instruction.type !== 'chars',
    };
  }, [
    activeInstruction,
    analysis,
    analyzedFiles,
    mdEnabled,
    resultsVersion,
    uiState.barTarget,
    uiState.sort,
  ]);

  const tabStatus = useMemo(() => {
    void resultsVersion;
    const statuses: Record<string, TabStatus> = {};
    for (const instruction of config.instructions) {
      if (!instruction.enabled) {
        statuses[instruction.id] = null;
        continue;
      }
      let pending = false;
      let error = false;
      for (const file of analyzedFiles) {
        const result = analysis.get(instruction.id, file.id);
        if (!result) pending = true;
        else if (result.error) error = true;
      }
      statuses[instruction.id] = error
        ? 'error'
        : pending && analyzedFiles.length
          ? 'pending'
          : null;
    }
    return statuses;
  }, [analysis, analyzedFiles, config.instructions, resultsVersion]);

  const onSort = (key: SortSpec['key']) => {
    if (!activeInstruction) return;
    const id = activeInstruction.id;
    setUiState((current) => {
      const sort = { ...current.sort };
      const existing = sort[id];
      if (!existing || existing.key !== key)
        sort[id] = { key, dir: key === 'name' ? 'asc' : 'desc' };
      else if (existing.dir === 'desc') sort[id] = { key, dir: 'asc' };
      else delete sort[id];
      return { ...current, sort };
    });
  };

  // ---------- отчёты ----------
  const whenIdle = () =>
    new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 60000;
      const tick = () => {
        if (!analysis.running && !analysisTimer.current) resolve();
        else if (Date.now() > deadline) reject(new Error('расчёт не завершился'));
        else window.setTimeout(tick, 100);
      };
      tick();
    });

  const exportReports = async () => {
    ui.setStatus('Готовим отчёты…', { sticky: true });
    try {
      if (!analyzedFiles.length) throw new Error('нет файлов для отчётов');
      await whenIdle();
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const enabled = config.instructions.filter((i) => i.enabled);
      const used = new Set<string>();
      const summary = [['файл', ...enabled.map((i) => i.title)]];
      for (const file of analyzedFiles) {
        summary.push([
          file.name,
          ...enabled.map((i) => {
            const r = analysis.get(i.id, file.id);
            return r && typeof r.value === 'number' ? String(r.value) : '';
          }),
        ]);
      }
      zip.file('summary.tsv', `${summary.map((row) => row.join('\t')).join('\n')}\n`);
      let reports = 0;
      for (const instruction of enabled) {
        if (instruction.type === 'chars') continue;
        let folder = safeName(instruction.title);
        if (used.has(folder)) folder = `${folder}_${safeName(instruction.id)}`;
        used.add(folder);
        for (const file of analyzedFiles) {
          const result: PairResult | null = analysis.get(instruction.id, file.id);
          if (!result || result.error) continue;
          const header = [
            `Файл: ${file.name}`,
            `Инструкция: ${instruction.title}`,
            `Находок: ${result.hits.length}`,
          ];
          zip.file(`${folder}/hits/${file.name}`, hitsReport(header, result.hits));
          zip.file(
            `${folder}/full/${file.name}`,
            applySquareBrackets(file.content, result.hits),
          );
          reports += 1;
        }
      }
      downloadBlob(
        await zip.generateAsync({ type: 'blob' }),
        `panalyzer-reports-${todayStamp()}.zip`,
      );
      ui.setStatus(`Отчётов в архиве: ${reports}, плюс summary.tsv`);
    } catch (error) {
      ui.setStatus(
        `Отчёты не собраны: ${error instanceof Error ? error.message : String(error)}`,
        { sticky: true },
      );
    }
  };

  const sectionsDialog = async () => {
    const mdRef = { current: null as HTMLInputElement | null };
    const ok = await ui.dialog<boolean>({
      message: 'Секции панели файлов',
      body: (
        <div>
          {SECTION_ORDER.map((section) => {
            const spec = SECTIONS[section];
            return (
              <label
                key={section}
                className={styles.formCheck}
                style={{ marginBottom: 8 }}
              >
                <input
                  ref={
                    section === 'md'
                      ? (node) => {
                          mdRef.current = node;
                        }
                      : undefined
                  }
                  type="checkbox"
                  defaultChecked={spec.always || (section === 'md' && mdEnabled)}
                  disabled={spec.always}
                />
                {spec.title} — {spec.role === 'source' ? 'источник' : 'анализируется'}
                {spec.always ? ', всегда включена' : ''} ({spec.accept.join(', ')})
              </label>
            );
          })}
          <p className={styles.formHelp}>
            Файлы выключенной секции остаются в браузере, но в анализ не попадают.
            Преобразование HTML всегда пишет в TXT.
          </p>
        </div>
      ),
      buttons: [
        { label: 'Применить', value: true, kind: 'primary' },
        { label: 'Отмена', value: false, kind: 'secondary' },
      ],
    });
    if (!ok) return;
    setUiState((current) => ({
      ...current,
      sections: { md: Boolean(mdRef.current?.checked) },
    }));
  };

  const openMoreMenu = (opener: HTMLElement) => {
    const rect = opener.getBoundingClientRect();
    ui.menu({
      x: rect.right - 200,
      y: rect.bottom + 6,
      opener,
      actions: [
        { label: 'Секции…', onSelect: () => void sectionsDialog() },
        { label: 'Экспорт отчётов ZIP', onSelect: () => void exportReports() },
        'separator',
        {
          label: 'Сбросить конфиг к базовому',
          danger: true,
          onSelect: async () => {
            if (
              await ui.confirm(
                'Заменить текущий конфиг базовым набором из четырёх инструкций?',
                'Сбросить',
                'danger',
              )
            )
              applyConfig(defaultConfig(), 'Конфиг сброшен');
          },
        },
      ],
    });
  };

  // ---------- делители ----------
  const sidebarResizer = useResizer({
    value: settings.sidebarWidth,
    ...SIDEBAR,
    increaseKey: 'ArrowRight',
    fromPointer: (event) =>
      event.clientX -
      (document.getElementById('main-content')?.getBoundingClientRect().left ?? 0),
    onChange: (value) =>
      setSettings((current) => ({ ...current, sidebarWidth: value })),
    onCommit: () => updateSettings({}),
    onDragState: setResizingCols,
  });
  const inspectorResizer = useResizer({
    value: settings.inspectorWidth,
    ...INSPECTOR,
    increaseKey: 'ArrowLeft',
    fromPointer: (event, start) => start.value + (start.x - event.clientX),
    onChange: (value) =>
      setSettings((current) => ({ ...current, inspectorWidth: value })),
    onCommit: () => updateSettings({}),
    onDragState: setResizingCols,
  });

  // ---------- рендер ----------
  const activeFile = activeFileId ? (files[activeFileId] ?? null) : null;
  const hitsFile =
    activeFile && SECTIONS[activeFile.section].role === 'text' ? activeFile : null;
  const viewerFile = viewer ? (files[viewer.fileId] ?? null) : null;
  const viewerInstruction = viewer?.instructionId
    ? (config.instructions.find((i) => i.id === viewer.instructionId) ?? null)
    : null;
  const viewerHits =
    viewerFile && viewerInstruction && viewerInstruction.type !== 'chars'
      ? (analysis.get(viewerInstruction.id, viewerFile.id)?.hits ?? [])
      : [];
  const counts = SECTION_ORDER.filter(
    (s) => SECTIONS[s].always || (s === 'md' && mdEnabled),
  ).map((s) => `${SECTIONS[s].title}: ${filesOfSection(fileList, s).length}`);

  const workspaceClass = [
    styles.workspace,
    resizingCols ? styles.resizingCols : '',
    resizingRows ? styles.resizingRows : '',
  ].join(' ');

  return (
    <>
      <AppHeaderContent
        title="Анализатор"
        actions={
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerAction}
              title="Загрузить JSON-конфиг с инструкциями"
              onClick={() => configInputRef.current?.click()}
            >
              <Icon name="upload" size={16} />
              <span>Импорт конфига</span>
            </button>
            <button
              type="button"
              className={styles.headerAction}
              title="Скачать текущий конфиг в JSON"
              onClick={exportConfig}
            >
              <Icon name="download" size={16} />
              <span>Экспорт конфига</span>
            </button>
            <button
              type="button"
              className={styles.headerAction}
              title="Пересчитать все инструкции по всем файлам заново"
              onClick={() => {
                runAnalysis(true);
                ui.setStatus('Пересчёт запущен');
              }}
            >
              <Icon name="sync" size={16} />
              <span>Пересчитать</span>
            </button>
            <button
              type="button"
              className={styles.headerAction}
              aria-pressed={settings.inspector}
              title="Панель инструкций и находок"
              onClick={() => updateSettings({ inspector: !settings.inspector })}
            >
              <Icon name="sliders" size={16} />
              <span>Инструкции</span>
            </button>
            <button
              type="button"
              className={styles.headerIcon}
              title="Ещё"
              aria-label="Ещё"
              aria-haspopup="menu"
              onClick={(event) => openMoreMenu(event.currentTarget)}
            >
              <Icon name="menu" size={16} />
            </button>
          </div>
        }
      />
      {progress && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <div
            className={styles.progressBar}
            style={{
              width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
            }}
          />
        </div>
      )}
      <div
        className={workspaceClass}
        data-testid="analyzer-workspace"
        style={{
          ['--analyzer-sidebar' as string]: `${settings.sidebarWidth}px`,
          ['--analyzer-inspector' as string]: `${settings.inspectorWidth}px`,
        }}
      >
        <div className={styles.layout}>
          <FilePanel
            files={fileList}
            mdEnabled={mdEnabled}
            activeFileId={activeFileId}
            weights={uiState.sectionWeights}
            onWeights={(weights) =>
              setUiState((current) => ({
                ...current,
                sectionWeights: { ...current.sectionWeights, ...weights },
              }))
            }
            onCommitWeights={() => undefined}
            onImport={pickFiles}
            onConvert={() => void convertHtml()}
            onExport={(section) => void exportSection(section)}
            onClear={(section) => void clearSection(section)}
            onOpen={(file) =>
              selectFile(file.id, SECTIONS[file.section].role === 'text')
            }
            onView={(file) =>
              openViewer(
                file.id,
                SECTIONS[file.section].role === 'text' ? activeTab : null,
              )
            }
            onMenu={openFileMenu}
            onDelete={(file) => removeFiles([file], `Удалено: ${file.name}`)}
            onRename={(file) => void renameFile(file)}
            onDrop={(section, entries, plain) => void onDrop(section, entries, plain)}
            onResizing={setResizingRows}
          />
          <div
            className={`${styles.vResizer} ${resizingCols ? styles.resizerActive : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Ширина панели файлов"
            aria-valuemin={SIDEBAR.min}
            aria-valuemax={SIDEBAR.max}
            aria-valuenow={settings.sidebarWidth}
            tabIndex={0}
            title="Потяните или измените стрелками; двойной клик — сброс"
            {...sidebarResizer}
          />
          <main className={styles.content}>
            <TabsBar
              instructions={config.instructions}
              activeId={activeTab}
              status={tabStatus}
              onSelect={(id) =>
                setUiState((current) => ({ ...current, activeTab: id }))
              }
              onMenu={(instruction, x, y, opener) => {
                const isChars = instruction.type === 'chars';
                ui.menu({
                  x,
                  y,
                  opener,
                  actions: [
                    {
                      label: 'Редактировать',
                      onSelect: () => {
                        setUiState((current) => ({
                          ...current,
                          activeTab: instruction.id,
                        }));
                        updateSettings({ inspector: true, inspectorTab: 'form' });
                      },
                    },
                    {
                      label: 'Дублировать',
                      onSelect: isChars
                        ? undefined
                        : () => duplicateInstruction(instruction.id),
                    },
                    {
                      label: instruction.enabled ? 'Выключить' : 'Включить',
                      onSelect: isChars
                        ? undefined
                        : () =>
                            patchInstruction(instruction.id, {
                              enabled: !instruction.enabled,
                            }),
                    },
                    'separator',
                    {
                      label: 'Удалить',
                      danger: true,
                      onSelect: isChars
                        ? undefined
                        : () => void deleteInstruction(instruction.id),
                    },
                  ],
                });
              }}
              onDelete={(id) => void deleteInstruction(id)}
              onReorder={reorderInstruction}
              onAdd={openAddMenu}
              onQuickAdd={quickAdd}
            />
            {viewer && viewerFile ? (
              <TextViewer
                key={`${viewer.fileId}-${viewer.instructionId ?? ''}-${viewer.index}`}
                file={viewerFile}
                title={viewerInstruction?.title ?? 'без инструкции'}
                hits={viewerHits}
                startIndex={viewer.index}
                onBack={() => setViewer(null)}
                onStatus={(text) => ui.setStatus(text)}
                copyText={copyText}
              />
            ) : (
              <div className={styles.tableArea}>
                <div className={styles.tableTools}>
                  <span className={styles.tableNote}>
                    {tableNoteFor(activeInstruction)}
                  </span>
                  <button
                    type="button"
                    className={styles.toolButton}
                    title="Скопировать всю таблицу как TSV"
                    onClick={async () => {
                      const tsv = tableToTsv(tableHostRef.current);
                      if (!tsv) return ui.setStatus('Таблица пуста');
                      ui.setStatus(
                        (await copyText(tsv))
                          ? 'Таблица скопирована как TSV'
                          : 'Не удалось скопировать',
                      );
                    }}
                  >
                    <Icon name="copy" size={14} />
                    <span>Скопировать таблицу</span>
                  </button>
                </div>
                {analyzedFiles.length === 0 ? (
                  <div className={styles.emptyNote}>
                    В секции TXT пока нет файлов. Перетащите их в панель слева или
                    преобразуйте HTML кнопкой со стрелкой.
                  </div>
                ) : (
                  tableModel && (
                    <div ref={tableHostRef} style={{ display: 'contents' }}>
                      <ResultsTable
                        key={tableModel.instruction.id}
                        model={tableModel}
                        onSort={onSort}
                        onBarTarget={(target) =>
                          setUiState((current) => ({
                            ...current,
                            barTarget: {
                              ...current.barTarget,
                              [tableModel.instruction.id]: target,
                            },
                          }))
                        }
                        onRowOpen={(fileId) =>
                          openViewer(fileId, tableModel.instruction.id)
                        }
                        onRowSelect={(fileId) =>
                          selectFile(fileId, tableModel.clickable)
                        }
                        onStatus={(text) => ui.setStatus(text)}
                        copyText={copyText}
                      />
                    </div>
                  )
                )}
              </div>
            )}
          </main>
          {settings.inspector && (
            <>
              <div
                className={`${styles.vResizer} ${resizingCols ? styles.resizerActive : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Ширина панели инструкций"
                aria-valuemin={INSPECTOR.min}
                aria-valuemax={INSPECTOR.max}
                aria-valuenow={settings.inspectorWidth}
                tabIndex={0}
                title="Потяните или измените стрелками; двойной клик — сброс"
                {...inspectorResizer}
              />
              <Inspector
                tab={settings.inspectorTab}
                onTab={(tab) => updateSettings({ inspectorTab: tab })}
                onClose={() => updateSettings({ inspector: false })}
                instruction={activeInstruction}
                mode={settings.editorMode}
                onMode={(mode) => {
                  updateSettings({ editorMode: mode });
                  setJsonDraft(null);
                }}
                jsonText={jsonText}
                jsonErrors={jsonDraft?.errors ?? []}
                jsonWarnings={jsonDraft?.warnings ?? []}
                onJsonChange={onJsonChange}
                onJsonApply={onJsonApply}
                onJsonReset={() => setJsonDraft(null)}
                onPatch={(patch) =>
                  activeInstruction && patchInstruction(activeInstruction.id, patch)
                }
                onParamsPatch={(patch) =>
                  activeInstruction && patchParams(activeInstruction.id, patch)
                }
                onType={(type) =>
                  activeInstruction && changeType(activeInstruction.id, type)
                }
                onDelete={() =>
                  activeInstruction && void deleteInstruction(activeInstruction.id)
                }
                onDuplicate={() =>
                  activeInstruction && duplicateInstruction(activeInstruction.id)
                }
                hitsFile={hitsFile}
                hitsResult={
                  hitsFile && activeInstruction
                    ? analysis.get(activeInstruction.id, hitsFile.id)
                    : null
                }
                onOpenViewer={(fileId, instructionId, index) =>
                  openViewer(fileId, instructionId, index)
                }
                onCopyHits={async () => {
                  if (!hitsFile || !activeInstruction) return;
                  const result = analysis.get(activeInstruction.id, hitsFile.id);
                  if (!result) return;
                  const header = [
                    `Файл: ${hitsFile.name}`,
                    `Инструкция: ${activeInstruction.title}`,
                    `Находок: ${result.hits.length}`,
                  ];
                  ui.setStatus(
                    (await copyText(hitsReport(header, result.hits)))
                      ? `Скопирован список находок: ${result.hits.length}`
                      : 'Не удалось скопировать',
                  );
                }}
              />
            </>
          )}
        </div>
        <footer className={styles.statusBar}>
          <span className={styles.statusCounts}>
            {[...counts, `инструкций: ${config.instructions.length}`].join(' · ')}
          </span>
          <span className={styles.statusLine} role="status">
            {status && (
              <>
                <span className={styles.statusText} title={status.text}>
                  {status.text}
                </span>
                {status.undo && (
                  <button
                    type="button"
                    className={styles.statusAction}
                    onClick={() => status.undo?.()}
                  >
                    Отменить
                  </button>
                )}
              </>
            )}
          </span>
          <span className={styles.statusTime}>
            {elapsed === null
              ? ''
              : `расчёт ${(elapsed / 1000).toFixed(elapsed < 1000 ? 2 : 1)} с`}
          </span>
        </footer>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="analyzer-upload"
        onChange={(event) => {
          const input = event.currentTarget;
          const section = (input.dataset.section as SectionId | undefined) ?? 'txt';
          void importFiles(section, Array.from(input.files ?? []));
        }}
      />
      <input
        ref={configInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="analyzer-config-upload"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file) void importConfigFile(file);
          input.value = '';
        }}
      />
    </>
  );
}

function tableNoteFor(instruction: Instruction | null): string {
  if (!instruction) return '';
  const parts = [instruction.description];
  if (instruction.type === 'regex') {
    const p = instruction.params;
    parts.push(
      `${p.mode === 'regex' ? 'регулярка' : 'подстрока'} «${p.query || '…'}», ${p.caseSensitive ? 'с учётом регистра' : 'без учёта регистра'}, счёт: ${p.unit === 'lines' ? 'строки' : 'совпадения'}`,
    );
    parts.push('клик по имени — находки, двойной клик — текст');
  } else {
    parts.push('Число символов после первых двух строк (заголовок и пустая строка).');
  }
  return parts.filter(Boolean).join(' · ');
}
