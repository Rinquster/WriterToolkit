// Хранение анализатора в базе WriterToolkit: файлы — в своём store, конфиг и состояние — в drafts.
import { draftRepository } from '../../../infrastructure/indexed-db/draftRepository';
import {
  openToolkitDatabase,
  requestToPromise,
  transactionToPromise,
} from '../../../infrastructure/indexed-db/database';
import type { AnalyzerFile, WorkspaceMeta } from '../model';

const FILES_STORE = 'analyzerFiles';
const META_DRAFT_ID = 'analyzer-workspace';

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

export interface AnalyzerRepository {
  readFiles(): Promise<AnalyzerFile[]>;
  writeFiles(put: readonly AnalyzerFile[], remove: readonly string[]): Promise<void>;
  readMeta(): Promise<unknown>;
  writeMeta(meta: WorkspaceMeta): Promise<void>;
}

class IndexedDbAnalyzerRepository implements AnalyzerRepository {
  async readFiles(): Promise<AnalyzerFile[]> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(FILES_STORE, 'readonly');
    const request = transaction.objectStore(FILES_STORE).getAll() as IDBRequest<
      AnalyzerFile[]
    >;
    const [files] = await Promise.all([
      requestToPromise(request),
      transactionToPromise(transaction),
    ]);
    return files ?? [];
  }

  writeFiles(put: readonly AnalyzerFile[], remove: readonly string[]): Promise<void> {
    if (put.length === 0 && remove.length === 0) return Promise.resolve();
    return enqueue(async () => {
      const database = await openToolkitDatabase();
      const transaction = database.transaction(FILES_STORE, 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      for (const id of remove) store.delete(id);
      for (const file of put) store.put(file);
      await transactionToPromise(transaction);
    });
  }

  readMeta(): Promise<unknown> {
    return draftRepository.get<unknown>(META_DRAFT_ID);
  }

  writeMeta(meta: WorkspaceMeta): Promise<void> {
    return enqueue(() => draftRepository.put(META_DRAFT_ID, meta));
  }
}

export const analyzerRepository: AnalyzerRepository = new IndexedDbAnalyzerRepository();
