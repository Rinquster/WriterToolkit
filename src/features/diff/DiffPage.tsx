import { useMemo, useState } from 'react';
import type { Change } from 'diff';
import PageHeader from '../../design-system/components/PageHeader';
import StatusBadge from '../../design-system/components/StatusBadge';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useLocalDraft } from '../../shared/hooks/useLocalDraft';
import { compareText, type DiffMode } from './diffText';
import styles from './DiffPage.module.css';

interface DiffDraft {
  before: string;
  after: string;
  mode: DiffMode;
  ignoreCase: boolean;
}

const initialDraft: DiffDraft = {
  before: '',
  after: '',
  mode: 'words',
  ignoreCase: false,
};

export default function DiffPage() {
  useDocumentTitle('Сравнение текстов');
  const draft = useLocalDraft('diff', initialDraft, isDiffDraft);
  const [layout, setLayout] = useState<'unified' | 'parallel'>('parallel');
  const comparison = useMemo(
    () => compareText(draft.value.before, draft.value.after, draft.value),
    [draft.value],
  );
  const identical = draft.value.before === draft.value.after;

  const update = (change: Partial<DiffDraft>) =>
    draft.setValue((current) => ({ ...current, ...change }));

  return (
    <>
      <PageHeader
        eyebrow="Редактура"
        title="Сравнение текстов"
        description="Пословное или построчное сравнение с сохранением пробелов и переносов."
        status={<StatusBadge tone="success">Автосохранение</StatusBadge>}
      />

      <div className={styles.workspace}>
        <div className={styles.toolbar}>
          <div className={styles.segmented} aria-label="Единица сравнения">
            <button
              type="button"
              aria-pressed={draft.value.mode === 'words'}
              onClick={() => update({ mode: 'words' })}
            >
              По словам
            </button>
            <button
              type="button"
              aria-pressed={draft.value.mode === 'lines'}
              onClick={() => update({ mode: 'lines' })}
            >
              По строкам
            </button>
          </div>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={draft.value.ignoreCase}
              onChange={(event) => update({ ignoreCase: event.target.checked })}
            />
            Игнорировать регистр
          </label>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              onClick={() =>
                update({ before: draft.value.after, after: draft.value.before })
              }
            >
              ⇄ Поменять местами
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void draft.clear()}
            >
              Очистить оба
            </button>
          </div>
        </div>

        {(draft.error || !draft.ready) && (
          <div
            className={draft.error ? styles.draftError : styles.loading}
            role="status"
          >
            {draft.error ?? 'Восстанавливаем локальный черновик…'}
          </div>
        )}

        <div className={styles.inputGrid}>
          <TextInput
            id="diff-before"
            label="Исходный текст"
            value={draft.value.before}
            disabled={!draft.ready}
            onChange={(before) => update({ before })}
          />
          <TextInput
            id="diff-after"
            label="Новая версия"
            value={draft.value.after}
            disabled={!draft.ready}
            onChange={(after) => update({ after })}
          />
        </div>

        <section className={styles.result} aria-labelledby="diff-result-title">
          <header className={styles.resultHeader}>
            <div>
              <p>Результат</p>
              <h2 id="diff-result-title">
                {comparison.timedOut
                  ? 'Сравнение прервано'
                  : identical
                    ? 'Тексты идентичны'
                    : 'Найдены различия'}
              </h2>
            </div>
            <div className={styles.resultControls}>
              {!identical && !comparison.timedOut && (
                <div className={styles.diffStats} aria-label="Статистика различий">
                  <span className={styles.removedStat}>
                    −{comparison.removedCharacters}
                  </span>
                  <span className={styles.addedStat}>
                    +{comparison.addedCharacters}
                  </span>
                </div>
              )}
              <div className={styles.segmented} aria-label="Расположение результата">
                <button
                  type="button"
                  aria-pressed={layout === 'parallel'}
                  onClick={() => setLayout('parallel')}
                >
                  Рядом
                </button>
                <button
                  type="button"
                  aria-pressed={layout === 'unified'}
                  onClick={() => setLayout('unified')}
                >
                  Вместе
                </button>
              </div>
            </div>
          </header>

          {comparison.timedOut ? (
            <div className={styles.resultMessage} role="alert">
              Тексты слишком различаются для быстрого сравнения. Попробуйте режим «По
              строкам» или разбейте их на части.
            </div>
          ) : !draft.value.before && !draft.value.after ? (
            <div className={styles.resultMessage}>
              Вставьте две версии текста в поля выше.
            </div>
          ) : identical ? (
            <div className={styles.identicalMessage}>Различий нет.</div>
          ) : layout === 'unified' ? (
            <div className={styles.unifiedDiff} aria-label="Объединённое сравнение">
              <DiffFragments changes={comparison.changes} side="both" />
            </div>
          ) : (
            <div className={styles.parallelDiff}>
              <div>
                <h3>Было</h3>
                <div
                  className={styles.diffText}
                  aria-label="Исходный текст с удалениями"
                >
                  <DiffFragments changes={comparison.changes} side="before" />
                </div>
              </div>
              <div>
                <h3>Стало</h3>
                <div
                  className={styles.diffText}
                  aria-label="Новый текст с добавлениями"
                >
                  <DiffFragments changes={comparison.changes} side="after" />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

interface TextInputProps {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}

function TextInput({ id, label, value, disabled, onChange }: TextInputProps) {
  return (
    <label className={styles.inputPanel} htmlFor={id}>
      <span>
        <strong>{label}</strong>
        <small>{value.length.toLocaleString('ru-RU')} знаков</small>
      </span>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={12}
        spellCheck
        placeholder="Вставьте текст…"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DiffFragments({
  changes,
  side,
}: {
  changes: Change[];
  side: 'before' | 'after' | 'both';
}) {
  return changes.map((change, index) => {
    if (side === 'before' && change.added) return null;
    if (side === 'after' && change.removed) return null;
    const className = change.added
      ? styles.added
      : change.removed
        ? styles.removed
        : styles.unchanged;
    return (
      <span
        key={`${index}-${change.value.length}`}
        className={className}
        data-change={change.added ? 'added' : change.removed ? 'removed' : 'unchanged'}
      >
        {change.value}
      </span>
    );
  });
}

function isDiffDraft(value: unknown): value is DiffDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'before' in value &&
    typeof value.before === 'string' &&
    'after' in value &&
    typeof value.after === 'string' &&
    'mode' in value &&
    (value.mode === 'words' || value.mode === 'lines') &&
    'ignoreCase' in value &&
    typeof value.ignoreCase === 'boolean'
  );
}
