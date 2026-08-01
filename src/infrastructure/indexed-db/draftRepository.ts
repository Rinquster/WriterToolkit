import {
  openToolkitDatabase,
  requestToPromise,
  transactionToPromise,
} from './database';

const DRAFT_STORE = 'drafts';

interface StoredDraft<TValue> {
  id: string;
  value: TValue;
  updatedAt: string;
}

export interface DraftRepository {
  get<TValue>(id: string): Promise<TValue | undefined>;
  put<TValue>(id: string, value: TValue): Promise<void>;
  delete(id: string): Promise<void>;
}

class IndexedDbDraftRepository implements DraftRepository {
  async get<TValue>(id: string): Promise<TValue | undefined> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(DRAFT_STORE).get(id) as IDBRequest<
      StoredDraft<TValue> | undefined
    >;
    const [stored] = await Promise.all([
      requestToPromise(request),
      transactionToPromise(transaction),
    ]);
    return stored ? structuredClone(stored.value) : undefined;
  }

  async put<TValue>(id: string, value: TValue): Promise<void> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    const request = transaction.objectStore(DRAFT_STORE).put({
      id,
      value: structuredClone(value),
      updatedAt: new Date().toISOString(),
    });
    await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  }

  async delete(id: string): Promise<void> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    const request = transaction.objectStore(DRAFT_STORE).delete(id);
    await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  }
}

export const draftRepository: DraftRepository = new IndexedDbDraftRepository();
