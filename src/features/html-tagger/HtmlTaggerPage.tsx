import { useMemo, useState } from 'react';
import PageHeader from '../../design-system/components/PageHeader';
import StatusBadge from '../../design-system/components/StatusBadge';
import { downloadTextFile } from '../../infrastructure/files/download';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useLocalDraft } from '../../shared/hooks/useLocalDraft';
import {
  completeHtmlDocument,
  textToHtml,
  type ParagraphMode,
  type TextToHtmlOptions,
} from './textToHtml';
import styles from './HtmlTaggerPage.module.css';

interface HtmlDraft extends TextToHtmlOptions {
  source: string;
}

const initialDraft: HtmlDraft = {
  source: '',
  paragraphMode: 'lines',
  emphasizeGuillemets: true,
  preserveBlankLines: true,
};

export default function HtmlTaggerPage() {
  useDocumentTitle('Text → HTML');
  const draft = useLocalDraft('html-tagger', initialDraft, isHtmlDraft);
  const [view, setView] = useState<'code' | 'preview'>('code');
  const [notice, setNotice] = useState('');
  const fragment = useMemo(
    () => textToHtml(draft.value.source, draft.value),
    [draft.value],
  );

  const update = (change: Partial<HtmlDraft>) =>
    draft.setValue((current) => ({ ...current, ...change }));

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(fragment);
      setNotice('HTML скопирован.');
    } catch {
      setNotice('Браузер не разрешил доступ к буферу обмена.');
    }
  };

  const openPreview = () => {
    const blob = new Blob(
      [completeHtmlDocument(fragment, 'Предпросмотр WriterToolkit')],
      {
        type: 'text/html;charset=utf-8',
      },
    );
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <>
      <PageHeader
        eyebrow="Публикация"
        title="Text → HTML"
        description="Безопасно превращает строки или абзацы в чистую HTML-разметку."
        status={<StatusBadge tone="success">Автосохранение</StatusBadge>}
      />

      <div className={styles.workspace}>
        <div className={styles.toolbar}>
          <label>
            <span>Группировка</span>
            <select
              value={draft.value.paragraphMode}
              onChange={(event) =>
                update({ paragraphMode: event.target.value as ParagraphMode })
              }
            >
              <option value="lines">Каждая строка — абзац</option>
              <option value="paragraphs">По пустым строкам</option>
            </select>
          </label>
          <label className={styles.checkOption}>
            <input
              type="checkbox"
              checked={draft.value.emphasizeGuillemets}
              onChange={(event) =>
                update({ emphasizeGuillemets: event.target.checked })
              }
            />
            <code>«…»</code> → <code>&lt;em&gt;</code>
          </label>
          <label className={styles.checkOption}>
            <input
              type="checkbox"
              checked={draft.value.preserveBlankLines}
              onChange={(event) => update({ preserveBlankLines: event.target.checked })}
            />
            Сохранять пустые строки
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={!fragment}
              onClick={() => void copyResult()}
            >
              Копировать HTML
            </button>
            <button
              type="button"
              disabled={!fragment}
              onClick={() =>
                downloadTextFile(
                  completeHtmlDocument(fragment),
                  'document.html',
                  'text/html;charset=utf-8',
                )
              }
            >
              Скачать .html
            </button>
            <button type="button" disabled={!fragment} onClick={openPreview}>
              Открыть отдельно
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void draft.clear()}
            >
              Очистить
            </button>
          </div>
        </div>

        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            <button
              type="button"
              aria-label="Закрыть сообщение"
              onClick={() => setNotice('')}
            >
              ×
            </button>
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

        <div className={styles.splitPane}>
          <label className={styles.sourcePane} htmlFor="html-source">
            <span className={styles.paneHeader}>
              <strong>Исходный текст</strong>
              <small>{draft.value.source.length.toLocaleString('ru-RU')} знаков</small>
            </span>
            <textarea
              id="html-source"
              value={draft.value.source}
              disabled={!draft.ready}
              rows={20}
              spellCheck
              placeholder={'Первая строка\n\nФраза с «выделением».'}
              onChange={(event) => update({ source: event.target.value })}
            />
          </label>

          <section className={styles.resultPane} aria-labelledby="html-result-title">
            <div className={styles.paneHeader}>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label="Вид HTML-результата"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'code'}
                  onClick={() => setView('code')}
                >
                  Код
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'preview'}
                  onClick={() => setView('preview')}
                >
                  Превью
                </button>
              </div>
              <small>{fragment.length.toLocaleString('ru-RU')} знаков HTML</small>
            </div>
            {view === 'code' ? (
              <textarea
                id="html-result-title"
                className={styles.codeOutput}
                value={fragment}
                rows={20}
                readOnly
                placeholder="HTML появится автоматически."
              />
            ) : (
              <div
                id="html-result-title"
                className={styles.preview}
                dangerouslySetInnerHTML={{
                  __html:
                    fragment ||
                    '<p class="empty-preview">Здесь появится результат.</p>',
                }}
              />
            )}
          </section>
        </div>

        <p className={styles.safetyNote}>
          Исходные символы <code>&lt;</code>, <code>&gt;</code>, <code>&amp;</code> и
          кавычки экранируются. В результат попадают только созданные WriterToolkit теги{' '}
          <code>&lt;p&gt;</code>,<code>&lt;br&gt;</code> и <code>&lt;em&gt;</code>.
        </p>
      </div>
    </>
  );
}

function isHtmlDraft(value: unknown): value is HtmlDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    typeof value.source === 'string' &&
    'paragraphMode' in value &&
    (value.paragraphMode === 'lines' || value.paragraphMode === 'paragraphs') &&
    'emphasizeGuillemets' in value &&
    typeof value.emphasizeGuillemets === 'boolean' &&
    'preserveBlankLines' in value &&
    typeof value.preserveBlankLines === 'boolean'
  );
}
