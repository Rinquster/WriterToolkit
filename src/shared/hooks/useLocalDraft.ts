import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  draftRepository,
  type DraftRepository,
} from '../../infrastructure/indexed-db/draftRepository';

export interface LocalDraftState<TValue> {
  value: TValue;
  setValue: Dispatch<SetStateAction<TValue>>;
  ready: boolean;
  error: string | undefined;
  clear(): Promise<void>;
}

export function useLocalDraft<TValue>(
  id: string,
  initialValue: TValue,
  isValid: (value: unknown) => value is TValue,
  repository: DraftRepository = draftRepository,
): LocalDraftState<TValue> {
  const [value, setValue] = useState(initialValue);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const latestRef = useRef(value);
  const readyRef = useRef(false);

  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  useEffect(() => {
    let active = true;
    void repository
      .get<unknown>(id)
      .then((stored) => {
        if (!active) return;
        if (stored !== undefined && isValid(stored)) {
          setValue(stored);
          latestRef.current = stored;
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) {
          readyRef.current = true;
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id, isValid, repository]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void repository
        .put(id, value)
        .catch((caught: unknown) => setError(errorMessage(caught)));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [id, ready, repository, value]);

  useEffect(
    () => () => {
      if (readyRef.current) void repository.put(id, latestRef.current);
    },
    [id, repository],
  );

  const clear = async () => {
    setValue(initialValue);
    latestRef.current = initialValue;
    setError(undefined);
    await repository.delete(id);
  };

  return { value, setValue, ready, error, clear };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Черновик не удалось сохранить в браузере.';
}
