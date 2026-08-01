import { useCallback, useEffect, useState } from 'react';
import {
  createDocument,
  type SceneDocument,
  type SceneDocumentSummary,
} from '../domain';
import {
  recoveryRepository,
  sceneDocumentRepository,
  type RecoveryRepository,
  type RecoverySummary,
  type SceneDocumentRepository,
} from '../data';

export interface SceneLibraryState {
  documents: SceneDocumentSummary[];
  recoveries: RecoverySummary[];
  loading: boolean;
  busy: boolean;
  error: string | undefined;
  refresh(): Promise<void>;
  create(name?: string): Promise<SceneDocument>;
  importDocument(document: SceneDocument): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  restore(snapshotId: string): Promise<void>;
}

export function useSceneLibrary(
  repository: SceneDocumentRepository = sceneDocumentRepository,
  recovery: RecoveryRepository = recoveryRepository,
): SceneLibraryState {
  const [documents, setDocuments] = useState<SceneDocumentSummary[]>([]);
  const [recoveries, setRecoveries] = useState<RecoverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setError(undefined);
      const [documentItems, recoveryItems] = await Promise.all([
        repository.list(),
        recovery.list(),
      ]);
      setDocuments(documentItems);
      setRecoveries(recoveryItems);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [recovery, repository]);

  useEffect(() => {
    let active = true;
    void Promise.all([repository.list(), recovery.list()])
      .then(([documentItems, recoveryItems]) => {
        if (active) {
          setDocuments(documentItems);
          setRecoveries(recoveryItems);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recovery, repository]);

  const create = useCallback(
    async (name = 'Новый документ') => {
      setBusy(true);
      setError(undefined);
      try {
        const document = createDocument(name);
        await repository.put(document);
        await refresh();
        return document;
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw new Error(message, { cause: caught });
      } finally {
        setBusy(false);
      }
    },
    [refresh, repository],
  );

  const importDocument = useCallback(
    async (document: SceneDocument) => {
      setBusy(true);
      setError(undefined);
      try {
        await repository.put(document);
        await refresh();
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw new Error(message, { cause: caught });
      } finally {
        setBusy(false);
      }
    },
    [refresh, repository],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(undefined);
      try {
        const document = await repository.get(id);
        if (!document)
          throw new Error('Документ уже отсутствует в локальной библиотеке.');
        await recovery.archiveAndDelete(document);
        await refresh();
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw new Error(message, { cause: caught });
      } finally {
        setBusy(false);
      }
    },
    [recovery, refresh, repository],
  );

  const restore = useCallback(
    async (snapshotId: string) => {
      setBusy(true);
      setError(undefined);
      try {
        const restored = await recovery.restore(snapshotId);
        if (!restored) throw new Error('Резервная копия уже отсутствует.');
        await refresh();
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw new Error(message, { cause: caught });
      } finally {
        setBusy(false);
      }
    },
    [recovery, refresh],
  );

  return {
    documents,
    recoveries,
    loading,
    busy,
    error,
    refresh,
    create,
    importDocument,
    deleteDocument,
    restore,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Неизвестная ошибка локального хранилища. Данные не были изменены.';
}
