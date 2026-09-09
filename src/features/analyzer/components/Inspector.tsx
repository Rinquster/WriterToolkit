// Правая панель: форма инструкции, сырой JSON, список находок.
import type { ReactNode } from 'react';
import type { Instruction } from '../core/config';
import {
  compileQuery,
  looksLikePythonRegex,
  translatePythonRegex,
  type InstructionType,
  type RegexParams,
} from '../core/instructions';
import type { PairResult } from '../analysis/analysisClient';
import type { AnalyzerFile } from '../model';
import styles from '../AnalyzerPage.module.css';

export interface InspectorProps {
  tab: 'form' | 'hits';
  onTab: (tab: 'form' | 'hits') => void;
  onClose: () => void;
  instruction: Instruction | null;
  mode: 'form' | 'json';
  onMode: (mode: 'form' | 'json') => void;
  jsonText: string;
  jsonErrors: string[];
  jsonWarnings: string[];
  onJsonChange: (text: string) => void;
  onJsonApply: () => void;
  onJsonReset: () => void;
  onPatch: (patch: Partial<Instruction>) => void;
  onParamsPatch: (patch: Partial<RegexParams>) => void;
  onType: (type: InstructionType) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  hitsFile: AnalyzerFile | null;
  hitsResult: PairResult | null;
  onOpenViewer: (fileId: string, instructionId: string, index: number) => void;
  onCopyHits: () => void;
}

export default function Inspector(props: InspectorProps) {
  return (
    <aside
      className={styles.inspector}
      aria-label="Инструкции и находки"
      data-testid="analyzer-inspector"
    >
      <div className={styles.inspectorHead}>
        <div className={styles.segmented} role="tablist" aria-label="Раздел панели">
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === 'form'}
            onClick={() => props.onTab('form')}
          >
            Инструкция
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === 'hits'}
            onClick={() => props.onTab('hits')}
          >
            Находки
          </button>
        </div>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.iconOnly}`}
          title="Закрыть панель"
          aria-label="Закрыть панель"
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>
      <div className={styles.inspectorPane}>
        {props.tab === 'form' ? (
          <InstructionForm {...props} />
        ) : (
          <HitsList {...props} />
        )}
      </div>
    </aside>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>{label}</label>
      {children}
      {help && <div className={styles.formHelp}>{help}</div>}
    </div>
  );
}

function InstructionForm(props: InspectorProps) {
  const modes = (
    <div
      className={styles.segmented}
      role="group"
      aria-label="Вид редактора"
      style={{ marginBottom: 12 }}
    >
      <button
        type="button"
        aria-pressed={props.mode === 'form'}
        onClick={() => props.onMode('form')}
      >
        Форма
      </button>
      <button
        type="button"
        aria-pressed={props.mode === 'json'}
        onClick={() => props.onMode('json')}
      >
        JSON
      </button>
    </div>
  );

  if (props.mode === 'json') {
    const messages = [
      ...props.jsonErrors.map((e) => `Ошибка: ${e}`),
      ...props.jsonWarnings.map((w) => `Предупреждение: ${w}`),
    ];
    return (
      <div>
        {modes}
        <p className={styles.inspectorNote}>
          Весь конфиг целиком. Проверяется при вводе, применяется кнопкой.
        </p>
        <textarea
          className={`${styles.formTextarea} ${styles.mono} ${styles.json}`}
          spellCheck={false}
          aria-label="JSON конфига"
          value={props.jsonText}
          onChange={(event) => props.onJsonChange(event.target.value)}
        />
        <div className={styles.formError}>{messages.join('\n')}</div>
        <div className={styles.inspectorActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={props.jsonErrors.length > 0}
            onClick={props.onJsonApply}
          >
            Применить
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={props.onJsonReset}
          >
            Вернуть текущий
          </button>
        </div>
      </div>
    );
  }

  const { instruction } = props;
  if (!instruction) {
    return (
      <div>
        {modes}
        <p className={styles.inspectorNote}>Выберите вкладку инструкции.</p>
      </div>
    );
  }
  const isChars = instruction.type === 'chars';
  const params = instruction.params;
  let queryError = '';
  if (instruction.type === 'regex') {
    try {
      if (params.query) compileQuery(params);
      else queryError = 'Запрос пуст.';
    } catch (error) {
      queryError = error instanceof Error ? error.message : String(error);
    }
  }
  const showTranslate =
    instruction.type === 'regex' && looksLikePythonRegex(params.query ?? '');

  return (
    <div>
      {modes}
      <Field label="Название">
        <input
          className={styles.formInput}
          type="text"
          maxLength={80}
          value={instruction.title}
          onChange={(event) => props.onPatch({ title: event.target.value })}
        />
      </Field>
      <Field
        label="Тип"
        help={
          isChars
            ? 'Число символов после первых двух строк (заголовок и пустая строка).'
            : 'Подстрока или регулярное выражение JavaScript.'
        }
      >
        <select
          className={styles.formSelect}
          value={instruction.type}
          disabled={isChars}
          onChange={(event) => props.onType(event.target.value as InstructionType)}
        >
          {isChars ? (
            <option value="chars">Символы</option>
          ) : (
            <option value="regex">Регулярка</option>
          )}
        </select>
      </Field>
      {!isChars && (
        <div className={styles.formRow}>
          <label className={styles.formCheck}>
            <input
              type="checkbox"
              checked={instruction.enabled}
              onChange={(event) => props.onPatch({ enabled: event.target.checked })}
            />
            Включена
          </label>
          <div className={styles.formHelp}>
            Выключенная инструкция не считается и не занимает время.
          </div>
        </div>
      )}
      {instruction.type === 'regex' && (
        <>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="analyzer-query">
              Запрос
            </label>
            <input
              id="analyzer-query"
              className={`${styles.formInput} ${styles.mono} ${queryError && params.query ? styles.invalid : ''}`}
              type="text"
              spellCheck={false}
              value={params.query ?? ''}
              onChange={(event) => props.onParamsPatch({ query: event.target.value })}
            />
            <div className={styles.formError} data-testid="query-error">
              {queryError}
            </div>
            {showTranslate && (
              <button
                type="button"
                className={`${styles.button} ${styles.secondary}`}
                style={{ marginTop: 6 }}
                onClick={() => {
                  const converted = translatePythonRegex(params.query ?? '');
                  props.onParamsPatch({
                    query: converted.query,
                    mode: 'regex',
                    ...converted.flags,
                  });
                }}
              >
                Перевести из Python
              </button>
            )}
          </div>
          <Field label="Режим">
            <select
              aria-label="Режим запроса"
              className={styles.formSelect}
              value={params.mode ?? 'literal'}
              onChange={(event) =>
                props.onParamsPatch({ mode: event.target.value as RegexParams['mode'] })
              }
            >
              <option value="literal">Подстрока</option>
              <option value="regex">Регулярка</option>
            </select>
          </Field>
          <div className={styles.formRow}>
            <label className={styles.formCheck}>
              <input
                type="checkbox"
                checked={Boolean(params.caseSensitive)}
                onChange={(event) =>
                  props.onParamsPatch({ caseSensitive: event.target.checked })
                }
              />
              Учитывать регистр
            </label>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formCheck}>
              <input
                type="checkbox"
                checked={Boolean(params.multiline)}
                onChange={(event) =>
                  props.onParamsPatch({ multiline: event.target.checked })
                }
              />
              Многострочный (флаги m и s)
            </label>
          </div>
          <Field label="Единица счёта">
            <select
              className={styles.formSelect}
              value={params.unit ?? 'matches'}
              onChange={(event) =>
                props.onParamsPatch({ unit: event.target.value as RegexParams['unit'] })
              }
            >
              <option value="matches">Совпадения</option>
              <option value="lines">Строки</option>
            </select>
          </Field>
        </>
      )}
      <Field
        label="Делитель полоски"
        help="Если не 1, в таблице появляется столбец «значение / делитель», и полоска целится в него."
      >
        <input
          className={styles.formInput}
          type="number"
          min={0.001}
          step="any"
          value={instruction.barDivisor}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value > 0)
              props.onPatch({ barDivisor: value });
          }}
        />
      </Field>
      <Field label="Подпись производного столбца">
        <input
          className={styles.formInput}
          type="text"
          maxLength={40}
          value={instruction.derivedTitle}
          onChange={(event) => props.onPatch({ derivedTitle: event.target.value })}
        />
      </Field>
      <Field label="Описание" help="Показывается подсказкой у вкладки.">
        <textarea
          className={styles.formTextarea}
          value={instruction.description}
          onChange={(event) => props.onPatch({ description: event.target.value })}
        />
      </Field>
      <div className={styles.inspectorActions}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          disabled={isChars}
          onClick={props.onDuplicate}
        >
          Дублировать
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.dangerButton}`}
          disabled={isChars}
          onClick={props.onDelete}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

function HitsList({
  instruction,
  hitsFile: file,
  hitsResult: result,
  onOpenViewer,
  onCopyHits,
}: InspectorProps) {
  if (!instruction)
    return <p className={styles.inspectorNote}>Выберите вкладку инструкции.</p>;
  if (!file)
    return (
      <p className={styles.inspectorNote}>
        Выберите файл в таблице: клик по имени показывает находки, двойной клик
        открывает текст.
      </p>
    );
  const head = (
    <p className={styles.hitsHead}>
      <strong>{file.name}</strong> · {instruction.title}
    </p>
  );
  if (instruction.type === 'chars') {
    return (
      <>
        {head}
        <p className={styles.inspectorNote}>
          У этой инструкции нет находок — только число.
        </p>
      </>
    );
  }
  if (!result) {
    return (
      <>
        {head}
        <p className={styles.inspectorNote}>Считается…</p>
      </>
    );
  }
  if (result.error) {
    return (
      <>
        {head}
        <p className={styles.formError}>{result.error}</p>
      </>
    );
  }
  const hits = result.hits;
  return (
    <>
      {head}
      <div className={styles.inspectorActions} style={{ margin: '0 0 12px' }}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={() => onOpenViewer(file.id, instruction.id, 0)}
        >
          Открыть текст
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          disabled={hits.length === 0}
          onClick={onCopyHits}
        >
          Скопировать список
        </button>
      </div>
      <p className={styles.inspectorNote}>
        {hits.length ? `Находок: ${hits.length}` : 'Находок нет.'}
      </p>
      <div className={styles.hitsList} data-testid="hits-list">
        {hits.map((hit, index) => {
          const where =
            hit.lineEnd && hit.lineEnd !== hit.lineStart
              ? `строки ${hit.lineStart}–${hit.lineEnd}`
              : `строка ${hit.lineStart}`;
          const context =
            typeof hit.extra.context === 'string' ? hit.extra.context : null;
          const idx = context ? context.indexOf(hit.text) : -1;
          return (
            <button
              key={`${hit.start}-${index}`}
              type="button"
              className={styles.hitItem}
              title={hit.reason}
              onClick={() => onOpenViewer(file.id, instruction.id, index)}
            >
              <span className={styles.hitLine}>
                {index + 1}. {where}
              </span>
              <span className={styles.hitText}>
                {context && idx >= 0 ? (
                  <>
                    {context.slice(0, idx)}
                    <mark>{hit.text}</mark>
                    {context.slice(idx + hit.text.length)}
                  </>
                ) : (
                  hit.text.trim()
                )}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
