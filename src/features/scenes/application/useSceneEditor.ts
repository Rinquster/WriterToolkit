import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneCommandResult, SceneDocument } from '../domain';
import { sceneDocumentRepository, type SceneDocumentRepository } from '../data';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error';
export type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

interface Revision {
  document: SceneDocument;
  number: number;
}

interface ApplyOptions {
  immediate?: boolean;
  historyGroup?: string;
  recordHistory?: boolean;
}

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface SceneEditorState {
  document: SceneDocument | undefined;
  loadState: LoadState;
  saveState: SaveState;
  error: string | undefined;
  commandError: string | undefined;
  canUndo: boolean;
  canRedo: boolean;
  apply(result: SceneCommandResult, options?: ApplyOptions): boolean;
  undo(): void;
  redo(): void;
  flush(): Promise<void>;
  retrySave(): void;
}

export function useSceneEditor(
  documentId: string | undefined,
  repository: SceneDocumentRepository = sceneDocumentRepository,
): SceneEditorState {
  const [revision, setRevision] = useState<Revision>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [error, setError] = useState<string>();
  const [commandError, setCommandError] = useState<string>();
  const [historyState, setHistoryState] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  });
  const latestRef = useRef<Revision | undefined>(undefined);
  const savedRevisionRef = useRef(0);
  const savingPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const mountedRef = useRef(true);
  const historyRef = useRef<{ past: SceneDocument[]; future: SceneDocument[] }>({
    past: [],
    future: [],
  });
  const lastHistoryGroupRef = useRef<{ name: string; timestamp: number } | undefined>(
    undefined,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // A route parameter change starts a different external repository request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadState('loading');
    setError(undefined);
    setCommandError(undefined);
    setRevision(undefined);
    latestRef.current = undefined;
    savedRevisionRef.current = 0;
    historyRef.current = { past: [], future: [] };
    lastHistoryGroupRef.current = undefined;
    setHistoryState({ canUndo: false, canRedo: false });

    if (!documentId) {
      setLoadState('not-found');
      return () => {
        active = false;
      };
    }

    void repository
      .get(documentId)
      .then((document) => {
        if (!active) return;
        if (!document) {
          setLoadState('not-found');
          return;
        }
        const initial = { document, number: 0 };
        latestRef.current = initial;
        setRevision(initial);
        setSaveState('clean');
        setLoadState('ready');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorMessage(caught, 'Не удалось открыть документ.'));
        setLoadState('error');
      });

    return () => {
      active = false;
    };
  }, [documentId, repository]);

  const saveLatest = useCallback(async () => {
    while (savingPromiseRef.current) {
      await savingPromiseRef.current;
    }

    if (!latestRef.current || latestRef.current.number <= savedRevisionRef.current)
      return;

    const saveTask = (async () => {
      try {
        while (
          latestRef.current &&
          latestRef.current.number > savedRevisionRef.current
        ) {
          const snapshot = latestRef.current;
          if (mountedRef.current) {
            setSaveState('saving');
            setError(undefined);
          }

          await repository.put(snapshot.document);
          savedRevisionRef.current = snapshot.number;

          if (mountedRef.current) {
            setSaveState(
              latestRef.current.number === savedRevisionRef.current ? 'clean' : 'dirty',
            );
          }
        }
      } catch (caught) {
        if (mountedRef.current) {
          setError(errorMessage(caught, 'Автосохранение не удалось.'));
          setSaveState('error');
        }
      }
    })();
    savingPromiseRef.current = saveTask;
    try {
      await saveTask;
    } finally {
      if (savingPromiseRef.current === saveTask) savingPromiseRef.current = undefined;
    }
  }, [repository]);

  useEffect(
    () => () => {
      if ((latestRef.current?.number ?? 0) > savedRevisionRef.current) {
        void saveLatest();
      }
    },
    [saveLatest],
  );

  useEffect(() => {
    if (
      !revision ||
      revision.number <= savedRevisionRef.current ||
      saveState === 'error'
    ) {
      return;
    }

    const timer = window.setTimeout(() => void saveLatest(), 700);
    return () => window.clearTimeout(timer);
  }, [revision, saveLatest, saveState]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if ((latestRef.current?.number ?? 0) > savedRevisionRef.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  const apply = useCallback(
    (result: SceneCommandResult, options: ApplyOptions = {}) => {
      if (!result.ok) {
        setCommandError(result.error.message);
        return false;
      }

      setCommandError(undefined);
      if (result.value === latestRef.current?.document) {
        return true;
      }

      const currentDocument = latestRef.current?.document;
      if (currentDocument && options.recordHistory !== false) {
        const now = Date.now();
        const lastGroup = lastHistoryGroupRef.current;
        const mergeWithPrevious =
          Boolean(options.historyGroup) &&
          lastGroup !== undefined &&
          lastGroup.name === options.historyGroup &&
          now - lastGroup.timestamp < 1_200;

        if (!mergeWithPrevious) {
          historyRef.current.past.push(currentDocument);
          if (historyRef.current.past.length > 100) historyRef.current.past.shift();
        }
        historyRef.current.future = [];
        lastHistoryGroupRef.current = options.historyGroup
          ? { name: options.historyGroup, timestamp: now }
          : undefined;
        setHistoryState({ canUndo: true, canRedo: false });
      }

      const nextRevision: Revision = {
        document: result.value,
        number: (latestRef.current?.number ?? 0) + 1,
      };
      latestRef.current = nextRevision;
      setRevision(nextRevision);
      setSaveState('dirty');
      setError(undefined);

      if (options.immediate) {
        queueMicrotask(() => void saveLatest());
      }
      return true;
    },
    [saveLatest],
  );

  const restoreFromHistory = useCallback(
    (document: SceneDocument) => {
      const nextRevision: Revision = {
        document: { ...document, updatedAt: new Date().toISOString() },
        number: (latestRef.current?.number ?? 0) + 1,
      };
      latestRef.current = nextRevision;
      setRevision(nextRevision);
      setSaveState('dirty');
      setError(undefined);
      setCommandError(undefined);
      lastHistoryGroupRef.current = undefined;
      setHistoryState({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
      queueMicrotask(() => void saveLatest());
    },
    [saveLatest],
  );

  const undo = useCallback(() => {
    const current = latestRef.current?.document;
    const previous = historyRef.current.past.pop();
    if (!current || !previous) return;
    historyRef.current.future.push(current);
    restoreFromHistory(previous);
  }, [restoreFromHistory]);

  const redo = useCallback(() => {
    const current = latestRef.current?.document;
    const next = historyRef.current.future.pop();
    if (!current || !next) return;
    historyRef.current.past.push(current);
    restoreFromHistory(next);
  }, [restoreFromHistory]);

  const retrySave = useCallback(() => {
    setSaveState('dirty');
    setError(undefined);
    void saveLatest();
  }, [saveLatest]);

  return {
    document: revision?.document,
    loadState,
    saveState,
    error,
    commandError,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    apply,
    undo,
    redo,
    flush: saveLatest,
    retrySave,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
