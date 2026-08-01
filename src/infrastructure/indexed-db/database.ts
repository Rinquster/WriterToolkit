const DATABASE_NAME = 'writertoolkit';
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;

export function openToolkitDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(
      new ToolkitDatabaseError(
        'Этот браузер не предоставляет IndexedDB. Локальное сохранение недоступно.',
      ),
    );
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      createStore(database, 'sceneDocuments', 'id');
      createStore(database, 'drafts', 'id');
      createStore(database, 'preferences', 'key');
      createStore(database, 'recovery', 'id');
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(
        new ToolkitDatabaseError(
          'Не удалось открыть локальное хранилище WriterToolkit.',
          request.error,
        ),
      );
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(
        new ToolkitDatabaseError(
          'Обновление хранилища заблокировано другой открытой вкладкой WriterToolkit.',
        ),
      );
    };
  });

  return databasePromise;
}

export class ToolkitDatabaseError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ToolkitDatabaseError';
    this.cause = cause;
  }
}

export function requestToPromise<TResult>(
  request: IDBRequest<TResult>,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new DOMException('Transaction aborted'));
  });
}

function createStore(database: IDBDatabase, name: string, keyPath: string): void {
  if (!database.objectStoreNames.contains(name)) {
    database.createObjectStore(name, { keyPath });
  }
}
