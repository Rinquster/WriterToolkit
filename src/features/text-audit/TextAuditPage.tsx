import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import AppHeaderContent from '../../design-system/components/AppHeaderContent';
import StatusBadge from '../../design-system/components/StatusBadge';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useLocalDraft } from '../../shared/hooks/useLocalDraft';
import {
  analyzeText,
  buildHighlightPlan,
  findMatches,
  parseFillerWords,
  ANOMALY_KINDS,
  CHAR_CATEGORIES,
  DEFAULT_FILLER_WORDS,
  MAX_HIGHLIGHT_LENGTH,
  type AnomalyKind,
  type CharCategory,
  type HighlightLayer,
  type HighlightRun,
} from './textAudit';
import styles from './TextAuditPage.module.css';

interface AuditDraft {
  source: string;
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  fillerWords: string;
  /** Поле добавлено позже, поэтому у ранних черновиков его нет. */
  spellCheck?: boolean;
}

const initialDraft: AuditDraft = {
  source: '',
  query: '',
  useRegex: false,
  caseSensitive: false,
  fillerWords: DEFAULT_FILLER_WORDS.join(', '),
  spellCheck: false,
};

const categoryLabels: Record<CharCategory, string> = {
  cyrillic: 'Кириллица',
  latin: 'Латиница',
  punctuation: 'Пунктуация',
  digit: 'Цифры',
  whitespace: 'Пробелы',
  other: 'Прочее',
};

const anomalyLabels: Record<AnomalyKind, string> = {
  mixedScript: 'Смешанные буквы',
  extraSpace: 'Двойные пробелы',
  trailingSpace: 'Пробелы в конце строк',
  spaceBeforePunctuation: 'Пробел перед знаком',
  invisible: 'Невидимые символы',
  typography: 'Типографика',
  repeatedWord: 'Повторы слов',
  fillerWord: 'Слова-паразиты',
};

const anomalyHints: Record<AnomalyKind, string> = {
  mixedScript: 'Слово, в котором смешаны кириллица и латиница: «кoшка» с английской o.',
  extraSpace: 'Два и более пробела подряд, кроме отступа в начале строки.',
  trailingSpace: 'Пробелы и табуляции в конце строки.',
  spaceBeforePunctuation: 'Пробел перед запятой, точкой, скобкой или кавычкой.',
  invisible: 'Неразрывный пробел, мягкий перенос, нулевая ширина, BOM.',
  typography: 'Прямые кавычки, дефис вместо тире, двойной дефис, три точки.',
  repeatedWord: 'Одно и то же слово дважды подряд в одной строке.',
  fillerWord: 'Слова из списка ниже — список можно менять.',
};

const layerClasses: Record<HighlightLayer, string | undefined> = {
  cyrillic: styles.cyrillic,
  latin: styles.latin,
  punctuation: styles.punctuation,
  digit: styles.digit,
  whitespace: styles.whitespace,
  other: styles.other,
  mixedScript: styles.mixedScript,
  extraSpace: styles.extraSpace,
  trailingSpace: styles.trailingSpace,
  spaceBeforePunctuation: styles.spaceBeforePunctuation,
  invisible: styles.invisible,
  typography: styles.typography,
  repeatedWord: styles.repeatedWord,
  fillerWord: styles.fillerWord,
  search: styles.search,
};

export default function TextAuditPage() {
  useDocumentTitle('Аудит текста');
  const draft = useLocalDraft('text-audit', initialDraft, isAuditDraft);
  const [activeCategories, setActiveCategories] = useState<readonly CharCategory[]>([]);
  const [activeAnomalies, setActiveAnomalies] = useState<readonly AnomalyKind[]>([
    'mixedScript',
    'extraSpace',
    'invisible',
  ]);
  const [matchIndex, setMatchIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const { source, query, useRegex, caseSensitive } = draft.value;
  const spellCheck = draft.value.spellCheck ?? false;
  const deferredSource = useDeferredValue(source);
  const stale = deferredSource !== source;
  const tooLarge = source.length > MAX_HIGHLIGHT_LENGTH;

  const fillerWords = useMemo(
    () => parseFillerWords(draft.value.fillerWords),
    [draft.value.fillerWords],
  );
  const analysis = useMemo(
    () => analyzeText(deferredSource, fillerWords),
    [deferredSource, fillerWords],
  );
  const search = useMemo(
    () => findMatches(deferredSource, query, { useRegex, caseSensitive }),
    [caseSensitive, deferredSource, query, useRegex],
  );
  const plan = useMemo(
    () =>
      buildHighlightPlan(deferredSource, {
        analysis,
        categories: activeCategories,
        anomalies: activeAnomalies,
        search: search.ranges,
      }),
    [activeAnomalies, activeCategories, analysis, deferredSource, search.ranges],
  );

  const runs: HighlightRun[] = useMemo(() => {
    if (!stale && plan.runs.length > 0) return plan.runs;
    return source.length > 0 ? [{ start: 0, end: source.length }] : [];
  }, [plan.runs, source.length, stale]);

  const matchCount = search.ranges.length;
  const currentMatch = matchCount === 0 ? 0 : Math.min(matchIndex, matchCount - 1);

  useEffect(() => {
    syncScroll(textareaRef.current, backdropRef.current);
  }, [runs]);

  const update = (change: Partial<AuditDraft>) =>
    draft.setValue((current) => ({ ...current, ...change }));

  const toggleCategory = (category: CharCategory) =>
    setActiveCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : CHAR_CATEGORIES.filter((item) => item === category || current.includes(item)),
    );

  const toggleAnomaly = (kind: AnomalyKind) =>
    setActiveAnomalies((current) =>
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : ANOMALY_KINDS.filter((item) => item === kind || current.includes(item)),
    );

  // Браузер обновляет отметки орфографии только при новой фокусировке поля.
  const toggleSpellCheck = (enabled: boolean) => {
    update({ spellCheck: enabled });
    const textarea = textareaRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    const { selectionStart, selectionEnd, scrollTop } = textarea;
    window.requestAnimationFrame(() => {
      textarea.blur();
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
      textarea.scrollTop = scrollTop;
    });
  };

  const goToMatch = (index: number) => {
    if (matchCount === 0) return;
    const target = (index + matchCount) % matchCount;
    const range = search.ranges[target];
    const textarea = textareaRef.current;
    setMatchIndex(target);
    if (!range || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(range.start, range.end);
    window.requestAnimationFrame(() => syncScroll(textarea, backdropRef.current));
  };

  return (
    <>
      <AppHeaderContent
        title="Аудит текста"
        status={<StatusBadge tone="success">Автосохранение</StatusBadge>}
        actions={
          <div className={styles.headerActions}>
            <div className={styles.totals}>
              <strong>{analysis.characters.toLocaleString('ru-RU')}</strong>
              <span>симв.</span>
              <strong>{analysis.words.toLocaleString('ru-RU')}</strong>
              <span>слов</span>
            </div>
            <div className={styles.chips} aria-label="Подсветка категорий символов">
              {CHAR_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`${styles.chip} ${styles[category]}`}
                  aria-pressed={activeCategories.includes(category)}
                  title={`Подсветить: ${categoryLabels[category]}`}
                  onClick={() => toggleCategory(category)}
                >
                  <span>{categoryLabels[category]}</span>
                  <small>{analysis.stats[category].toLocaleString('ru-RU')}</small>
                </button>
              ))}
            </div>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void draft.clear()}
            >
              Очистить
            </button>
          </div>
        }
      />

      <div className={styles.workspace} data-testid="audit-workspace">
        <div className={styles.toolbar}>
          <label className={styles.searchField} htmlFor="audit-query">
            <span>Поиск</span>
            <input
              id="audit-query"
              type="search"
              value={query}
              spellCheck={false}
              placeholder={useRegex ? '\\s{2,}|[a-z]+' : 'подстрока'}
              onChange={(event) => {
                setMatchIndex(0);
                update({ query: event.target.value });
              }}
            />
          </label>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(event) => update({ useRegex: event.target.checked })}
            />
            Регулярка
          </label>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => update({ caseSensitive: event.target.checked })}
            />
            Учитывать регистр
          </label>
          <label
            className={styles.option}
            title="Красное волнистое подчёркивание слов, которых нет в словаре браузера."
          >
            <input
              type="checkbox"
              checked={spellCheck}
              onChange={(event) => toggleSpellCheck(event.target.checked)}
            />
            Проверка орфографии
          </label>
          <div className={styles.matchNav}>
            <span data-testid="audit-match-count">
              {query === ''
                ? 'Не задан'
                : matchCount === 0
                  ? 'Нет совпадений'
                  : `${currentMatch + 1} из ${matchCount.toLocaleString('ru-RU')}${
                      search.truncated ? '+' : ''
                    }`}
            </span>
            <button
              type="button"
              aria-label="Предыдущее совпадение"
              disabled={matchCount === 0}
              onClick={() => goToMatch(currentMatch - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Следующее совпадение"
              disabled={matchCount === 0}
              onClick={() => goToMatch(currentMatch + 1)}
            >
              ↓
            </button>
          </div>
        </div>

        <div className={styles.chips} aria-label="Подсветка артефактов">
          {ANOMALY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`${styles.chip} ${styles[kind]}`}
              aria-pressed={activeAnomalies.includes(kind)}
              title={anomalyHints[kind]}
              onClick={() => toggleAnomaly(kind)}
            >
              <span>{anomalyLabels[kind]}</span>
              <small>{analysis.anomalies[kind].length.toLocaleString('ru-RU')}</small>
            </button>
          ))}
        </div>

        {search.error && (
          <div className={styles.draftError} role="status">
            Неверное регулярное выражение: {search.error}
          </div>
        )}
        {(draft.error || !draft.ready) && (
          <div
            className={draft.error ? styles.draftError : styles.loading}
            role="status"
          >
            {draft.error ?? 'Восстанавливаем локальный черновик…'}
          </div>
        )}
        {tooLarge && (
          <div className={styles.draftError} role="status">
            Текст длиннее {MAX_HIGHLIGHT_LENGTH.toLocaleString('ru-RU')} символов:
            счётчики работают, подсветка отключена.
          </div>
        )}
        {plan.truncated && !tooLarge && (
          <div className={styles.draftError} role="status">
            Подсвечено слишком много фрагментов — часть текста в конце осталась без
            разметки. Снимите часть категорий.
          </div>
        )}

        <div className={styles.editor}>
          <div
            className={styles.backdrop}
            ref={backdropRef}
            data-testid="audit-backdrop"
            aria-hidden="true"
          >
            <div className={styles.highlights} data-testid="audit-highlights">
              {runs.map((run) =>
                run.layer ? (
                  <span
                    key={run.start}
                    className={layerClasses[run.layer]}
                    data-layer={run.layer}
                  >
                    {deferredSource.slice(run.start, run.end)}
                  </span>
                ) : (
                  <span key={run.start}>
                    {(stale || tooLarge ? source : deferredSource).slice(
                      run.start,
                      run.end,
                    )}
                  </span>
                ),
              )}
              {'\n'}
            </div>
          </div>
          <label className={styles.inputLabel} htmlFor="audit-source">
            Текст для аудита
          </label>
          <textarea
            id="audit-source"
            ref={textareaRef}
            className={styles.input}
            value={source}
            disabled={!draft.ready}
            spellCheck={spellCheck}
            placeholder="Вставьте текст — анализ появится в шапке."
            onChange={(event) => update({ source: event.target.value })}
            onScroll={(event: UIEvent<HTMLTextAreaElement>) =>
              syncScroll(event.currentTarget, backdropRef.current)
            }
          />
        </div>

        <details className={styles.fillerEditor}>
          <summary>Список слов-паразитов ({fillerWords.length})</summary>
          <label htmlFor="audit-filler">
            Слова и фразы через запятую или с новой строки. Регистр и «ё» не важны.
          </label>
          <textarea
            id="audit-filler"
            value={draft.value.fillerWords}
            rows={4}
            spellCheck={false}
            onChange={(event) => update({ fillerWords: event.target.value })}
          />
          <button
            type="button"
            onClick={() => update({ fillerWords: DEFAULT_FILLER_WORDS.join(', ') })}
          >
            Вернуть список по умолчанию
          </button>
        </details>

        <p className={styles.safetyNote}>
          Текст не покидает браузер и сохраняется в IndexedDB. Подсветка накладывается
          слоями: поиск важнее артефактов, артефакты важнее категорий символов.
        </p>
      </div>
    </>
  );
}

function syncScroll(
  textarea: HTMLTextAreaElement | null,
  backdrop: HTMLDivElement | null,
): void {
  if (!textarea || !backdrop) return;
  backdrop.scrollTop = textarea.scrollTop;
  backdrop.scrollLeft = textarea.scrollLeft;
}

function isAuditDraft(value: unknown): value is AuditDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    typeof value.source === 'string' &&
    'query' in value &&
    typeof value.query === 'string' &&
    'useRegex' in value &&
    typeof value.useRegex === 'boolean' &&
    'caseSensitive' in value &&
    typeof value.caseSensitive === 'boolean' &&
    'fillerWords' in value &&
    typeof value.fillerWords === 'string' &&
    (!('spellCheck' in value) || typeof value.spellCheck === 'boolean')
  );
}
