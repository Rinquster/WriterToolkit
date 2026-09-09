// Web Worker: считает инструкции по файлам и шлёт результаты пакетами.
import {
  computeInstruction,
  type InstructionType,
  type RegexParams,
} from '../core/instructions';
import type { Hit } from '../core/text';

export interface WorkerJob {
  type: 'run';
  jobId: number;
  files: { id: string; content: string }[];
  instructions: { id: string; type: InstructionType; params: Partial<RegexParams> }[];
  pairs: [string, string][];
}

export interface ResultItem {
  fileId: string;
  instructionId: string;
  value: number | null;
  hits: Hit[];
  error: string | null;
}

export type WorkerMessage =
  | { type: 'begin'; jobId: number; fileId: string; instructionId: string }
  | { type: 'results'; jobId: number; items: ResultItem[] }
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'done'; jobId: number; total: number };

let currentJob = 0;

self.addEventListener('message', (event: MessageEvent<WorkerJob>) => {
  const message = event.data;
  if (!message || message.type !== 'run') return;
  currentJob = message.jobId;
  runJob(message);
});

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

function runJob(job: WorkerJob): void {
  const files = new Map(job.files.map((file) => [file.id, file.content]));
  const instructions = new Map(
    job.instructions.map((instruction) => [instruction.id, instruction]),
  );
  const total = job.pairs.length;
  let done = 0;
  const step = (index: number) => {
    if (job.jobId !== currentJob) return; // пришла новая задача — эту бросаем
    const limit = Math.min(total, index + 8);
    const batch: ResultItem[] = [];
    for (let k = index; k < limit; k += 1) {
      const pair = job.pairs[k];
      if (!pair) continue;
      const [fileId, instructionId] = pair;
      const instruction = instructions.get(instructionId);
      const content = files.get(fileId);
      post({ type: 'begin', jobId: job.jobId, fileId, instructionId });
      const result =
        instruction === undefined || content === undefined
          ? { value: null, hits: [], error: 'нет данных' }
          : computeInstruction(instruction.type, content, instruction.params);
      batch.push({
        fileId,
        instructionId,
        value: result.value,
        hits: result.hits,
        error: result.error ?? null,
      });
      done += 1;
    }
    if (batch.length) post({ type: 'results', jobId: job.jobId, items: batch });
    post({ type: 'progress', jobId: job.jobId, done, total });
    if (limit < total) setTimeout(() => step(limit), 0);
    else post({ type: 'done', jobId: job.jobId, total });
  };
  step(0);
}
