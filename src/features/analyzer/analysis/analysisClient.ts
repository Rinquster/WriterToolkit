// Клиент воркера: кэш по (файл, инструкция), прогресс, сторожевой таймер на зависшую регулярку.
import { instructionKey, type Instruction } from '../core/config';
import type { Hit } from '../core/text';
import type { ResultItem, WorkerJob, WorkerMessage } from './worker';

const PAIR_TIMEOUT_MS = 5000;

export interface PairResult {
  value: number | null;
  hits: Hit[];
  error: string | null;
  fileStamp: number;
  key: string;
}

export interface AnalysisHandlers {
  onProgress(progress: { done: number; total: number }): void;
  onResults(items: ResultItem[]): void;
  onDone(summary: { pairs: number; elapsed: number }): void;
  onError(message: string): void;
}

export interface AnalyzableFile {
  id: string;
  content: string;
  updatedAt: number;
}

export class AnalysisClient {
  private worker: Worker | null = null;
  private jobId = 0;
  running = false;
  readonly results = new Map<string, Map<string, PairResult>>();
  private watchdog = 0;
  private current: { fileId: string; instructionId: string } | null = null;
  private readonly poisoned = new Set<string>();
  private startedAt = 0;
  private jobFiles = new Map<string, number>();
  private jobKeys = new Map<string, string>();

  constructor(
    private readonly createWorker: () => Worker,
    private readonly handlers: AnalysisHandlers,
  ) {}

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) =>
      this.onMessage(event.data),
    );
    worker.addEventListener('error', (event) =>
      this.handlers.onError(event.message || 'ошибка воркера'),
    );
    this.worker = worker;
    return worker;
  }

  get(instructionId: string, fileId: string): PairResult | null {
    return this.results.get(instructionId)?.get(fileId) ?? null;
  }

  forget(fileId: string): void {
    for (const byFile of this.results.values()) byFile.delete(fileId);
  }

  drop(instructionId: string): void {
    this.results.delete(instructionId);
  }

  prune(instructions: readonly Instruction[]): void {
    const ids = new Set(instructions.map((instruction) => instruction.id));
    for (const id of Array.from(this.results.keys()))
      if (!ids.has(id)) this.results.delete(id);
  }

  dispose(): void {
    this.clearWatchdog();
    this.worker?.terminate();
    this.worker = null;
    this.running = false;
  }

  /** Запускает расчёт недостающих пар; возвращает число пар в задаче. */
  schedule(
    files: readonly AnalyzableFile[],
    instructions: readonly Instruction[],
    force = false,
  ): number {
    const worker = this.spawn();
    if (force) this.poisoned.clear();
    const pairs: [string, string][] = [];
    const usedFiles = new Set<string>();
    const usedInstructions = new Set<string>();
    for (const instruction of instructions) {
      if (!instruction.enabled) continue;
      const key = instructionKey(instruction);
      if (this.poisoned.has(key)) continue;
      let byFile = this.results.get(instruction.id);
      if (!byFile) {
        byFile = new Map();
        this.results.set(instruction.id, byFile);
      }
      for (const file of files) {
        const have = byFile.get(file.id);
        if (!force && have && have.key === key && have.fileStamp === file.updatedAt)
          continue;
        pairs.push([file.id, instruction.id]);
        usedFiles.add(file.id);
        usedInstructions.add(instruction.id);
      }
    }
    if (pairs.length === 0) {
      if (!this.running) this.handlers.onDone({ pairs: 0, elapsed: 0 });
      return 0;
    }
    this.jobId += 1;
    this.running = true;
    this.startedAt = performance.now();
    this.jobFiles = new Map(files.map((file) => [file.id, file.updatedAt]));
    this.jobKeys = new Map(
      instructions.map((instruction) => [instruction.id, instructionKey(instruction)]),
    );
    const job: WorkerJob = {
      type: 'run',
      jobId: this.jobId,
      files: files
        .filter((file) => usedFiles.has(file.id))
        .map((file) => ({ id: file.id, content: file.content })),
      instructions: instructions
        .filter((instruction) => usedInstructions.has(instruction.id))
        .map((instruction) => ({
          id: instruction.id,
          type: instruction.type,
          params: instruction.params,
        })),
      pairs,
    };
    worker.postMessage(job);
    this.handlers.onProgress({ done: 0, total: pairs.length });
    return pairs.length;
  }

  private onMessage(message: WorkerMessage): void {
    if (!message || message.jobId !== this.jobId) return;
    if (message.type === 'begin') {
      this.current = { fileId: message.fileId, instructionId: message.instructionId };
      this.armWatchdog();
      return;
    }
    if (message.type === 'results') {
      for (const item of message.items) {
        const byFile = this.results.get(item.instructionId);
        if (!byFile) continue;
        byFile.set(item.fileId, {
          value: item.value,
          hits: item.hits,
          error: item.error,
          fileStamp: this.jobFiles.get(item.fileId) ?? 0,
          key: this.jobKeys.get(item.instructionId) ?? '',
        });
      }
      this.handlers.onResults(message.items);
      return;
    }
    if (message.type === 'progress') {
      this.handlers.onProgress({ done: message.done, total: message.total });
      return;
    }
    this.clearWatchdog();
    this.running = false;
    this.current = null;
    this.handlers.onDone({
      pairs: message.total,
      elapsed: performance.now() - this.startedAt,
    });
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdog = window.setTimeout(() => this.onStuck(), PAIR_TIMEOUT_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdog) window.clearTimeout(this.watchdog);
    this.watchdog = 0;
  }

  /** Пара считается слишком долго: убиваем воркер, помечаем инструкцию, остальное досчитается заново. */
  private onStuck(): void {
    const stuck = this.current;
    this.clearWatchdog();
    this.worker?.terminate();
    this.worker = null;
    this.running = false;
    this.current = null;
    if (stuck) {
      const key = this.jobKeys.get(stuck.instructionId);
      if (key) this.poisoned.add(key);
      const byFile = this.results.get(stuck.instructionId);
      if (byFile) {
        for (const [fileId, stamp] of this.jobFiles) {
          byFile.set(fileId, {
            value: null,
            hits: [],
            error: 'регулярка работает слишком долго',
            fileStamp: stamp,
            key: key ?? '',
          });
        }
      }
    }
    this.handlers.onError(
      `инструкция остановлена: пара считалась дольше ${PAIR_TIMEOUT_MS / 1000} с`,
    );
  }
}
