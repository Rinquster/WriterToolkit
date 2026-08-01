import {
  cloneDocument,
  summarizeDocument,
  validateDocument,
  type DocumentId,
  type SceneDocument,
  type SceneDocumentSummary,
} from '../domain';
import {
  RepositoryError,
  type RepositoryErrorCode,
  type SceneDocumentRepository,
} from './repository';
import {
  openToolkitDatabase,
  requestToPromise,
  transactionToPromise,
} from '../../../infrastructure/indexed-db/database';

const DOCUMENT_STORE = 'sceneDocuments';

export class IndexedDbSceneDocumentRepository implements SceneDocumentRepository {
  async list(): Promise<SceneDocumentSummary[]> {
    const documents = await this.runRequest<SceneDocument[]>(
      'readonly',
      (store) => store.getAll(),
      'read-failed',
      'Не удалось прочитать список документов из браузера.',
    );

    return documents
      .map((document) => summarizeDocument(document))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: DocumentId): Promise<SceneDocument | undefined> {
    const document = await this.runRequest<SceneDocument | undefined>(
      'readonly',
      (store) => store.get(id),
      'read-failed',
      'Не удалось открыть документ из браузера.',
    );
    return document ? cloneDocument(document) : undefined;
  }

  async put(document: SceneDocument): Promise<void> {
    const validation = validateDocument(document);
    if (!validation.valid) {
      throw new RepositoryError(
        'invalid-document',
        'Невалидный документ не был записан в хранилище.',
        validation.issues,
      );
    }

    await this.runRequest(
      'readwrite',
      (store) => store.put(cloneDocument(document)),
      'write-failed',
      'Не удалось сохранить документ в браузере.',
    );
  }

  async delete(id: DocumentId): Promise<void> {
    await this.runRequest(
      'readwrite',
      (store) => store.delete(id),
      'delete-failed',
      'Не удалось удалить документ из браузера.',
    );
  }

  private async runRequest<TResult>(
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<TResult>,
    errorCode: RepositoryErrorCode,
    errorMessage: string,
  ): Promise<TResult> {
    try {
      const database = await openToolkitDatabase();
      const transaction = database.transaction(DOCUMENT_STORE, mode);
      const request = createRequest(transaction.objectStore(DOCUMENT_STORE));
      const [result] = await Promise.all([
        requestToPromise(request),
        transactionToPromise(transaction),
      ]);
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) {
        throw error;
      }
      throw new RepositoryError(errorCode, errorMessage, error);
    }
  }
}

export const sceneDocumentRepository = new IndexedDbSceneDocumentRepository();
