import { cloneDocument, type SceneDocument } from '../domain';
import {
  openToolkitDatabase,
  requestToPromise,
  transactionToPromise,
} from '../../../infrastructure/indexed-db/database';

const RECOVERY_STORE = 'recovery';
const DOCUMENT_STORE = 'sceneDocuments';
const MAX_SNAPSHOTS = 10;

interface RecoverySnapshot {
  id: string;
  documentId: string;
  deletedAt: string;
  reason: 'document-deleted';
  document: SceneDocument;
}

export interface RecoverySummary {
  id: string;
  documentId: string;
  name: string;
  sceneCount: number;
  deletedAt: string;
}

export interface RecoveryRepository {
  list(): Promise<RecoverySummary[]>;
  archiveAndDelete(document: SceneDocument): Promise<void>;
  restore(snapshotId: string): Promise<boolean>;
  discard(snapshotId: string): Promise<void>;
}

class IndexedDbRecoveryRepository implements RecoveryRepository {
  async list(): Promise<RecoverySummary[]> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(RECOVERY_STORE, 'readonly');
    const request = transaction.objectStore(RECOVERY_STORE).getAll() as IDBRequest<
      RecoverySnapshot[]
    >;
    const [snapshots] = await Promise.all([
      requestToPromise(request),
      transactionToPromise(transaction),
    ]);
    return snapshots
      .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
      .map((snapshot) => ({
        id: snapshot.id,
        documentId: snapshot.documentId,
        name: snapshot.document.name,
        sceneCount: snapshot.document.scenes.length,
        deletedAt: snapshot.deletedAt,
      }));
  }

  async archiveAndDelete(document: SceneDocument): Promise<void> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(
      [RECOVERY_STORE, DOCUMENT_STORE],
      'readwrite',
    );
    const deletedAt = new Date().toISOString();
    transaction.objectStore(RECOVERY_STORE).put({
      id: crypto.randomUUID(),
      documentId: document.id,
      deletedAt,
      reason: 'document-deleted',
      document: cloneDocument(document),
    } satisfies RecoverySnapshot);
    transaction.objectStore(DOCUMENT_STORE).delete(document.id);
    await transactionToPromise(transaction);
    await this.prune();
  }

  async restore(snapshotId: string): Promise<boolean> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(
      [RECOVERY_STORE, DOCUMENT_STORE],
      'readwrite',
    );
    const recoveryStore = transaction.objectStore(RECOVERY_STORE);
    const documentStore = transaction.objectStore(DOCUMENT_STORE);
    const request = recoveryStore.get(snapshotId) as IDBRequest<
      RecoverySnapshot | undefined
    >;

    const found = await new Promise<boolean>((resolve, reject) => {
      request.onsuccess = () => {
        const snapshot = request.result;
        if (!snapshot) {
          resolve(false);
          return;
        }
        documentStore.put({
          ...cloneDocument(snapshot.document),
          updatedAt: new Date().toISOString(),
        });
        recoveryStore.delete(snapshotId);
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
    await transactionToPromise(transaction);
    return found;
  }

  async discard(snapshotId: string): Promise<void> {
    const database = await openToolkitDatabase();
    const transaction = database.transaction(RECOVERY_STORE, 'readwrite');
    const request = transaction.objectStore(RECOVERY_STORE).delete(snapshotId);
    await Promise.all([requestToPromise(request), transactionToPromise(transaction)]);
  }

  private async prune(): Promise<void> {
    const snapshots = await this.list();
    const excess = snapshots.slice(MAX_SNAPSHOTS);
    await Promise.all(excess.map((snapshot) => this.discard(snapshot.id)));
  }
}

export const recoveryRepository: RecoveryRepository = new IndexedDbRecoveryRepository();
