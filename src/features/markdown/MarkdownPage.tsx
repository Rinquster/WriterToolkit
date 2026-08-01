import { useMemo, useRef, useState } from 'react';
import AppHeaderContent from '../../design-system/components/AppHeaderContent';
import StatusBadge from '../../design-system/components/StatusBadge';
import { downloadTextFile } from '../../infrastructure/files/download';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useLocalDraft } from '../../shared/hooks/useLocalDraft';
import { renderMarkdown } from './markdown';
import styles from './MarkdownPage.module.css';

interface MarkdownDraft {
  markdown: string;
  breaks: boolean;
}

const initialDraft: MarkdownDraft = { markdown: '', breaks: false };

export default function MarkdownPage() {
  useDocumentTitle('Markdown');
  const draft = useLocalDraft('markdown', initialDraft, isMarkdownDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<'preview' | 'html'>('preview');
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');
  const html = useMemo(
    () => renderMarkdown(draft.value.markdown, draft.value.breaks),
    [draft.value.breaks, draft.value.markdown],
  );

  const updateMarkdown = (markdown: string) =>
    draft.setValue((current) => ({ ...current, markdown }));

  const applyMarkup = (before: string, after = before, placeholder = 'текст') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.value.markdown.slice(start, end) || placeholder;
    const replacement = `${before}${selected}${after}`;
    updateMarkdown(
      `${draft.value.markdown.slice(0, start)}${replacement}${draft.value.markdown.slice(end)}`,
    );
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    }, 0);
  };

  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start =
      draft.value.markdown.lastIndexOf('\n', Math.max(0, textarea.selectionStart - 1)) +
      1;
    const nextBreak = draft.value.markdown.indexOf('\n', textarea.selectionEnd);
    const end = nextBreak === -1 ? draft.value.markdown.length : nextBreak;
    const block = draft.value.markdown.slice(start, end) || 'пункт';
    const replacement = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    updateMarkdown(
      `${draft.value.markdown.slice(0, start)}${replacement}${draft.value.markdown.slice(end)}`,
    );
    window.setTimeout(() => textarea.focus(), 0);
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} скопирован.`);
    } catch {
      setNotice('Браузер не разрешил доступ к буферу обмена.');
    }
  };

  return (
    <>
      <AppHeaderContent
        title="Markdown"
        status={<StatusBadge tone="success">Автосохранение</StatusBadge>}
        actions={
          <div className={styles.fileActions}>
            <button
              type="button"
              onClick={() => void copy(draft.value.markdown, 'Markdown')}
            >
              Копировать MD
            </button>
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  draft.value.markdown,
                  'document.md',
                  'text/markdown;charset=utf-8',
                )
              }
            >
              Скачать .md
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => setConfirmClear(true)}
            >
              Очистить
            </button>
          </div>
        }
      />

      <div className={styles.workspace}>
        <div className={styles.topbar}>
          <div className={styles.formatting} aria-label="Форматирование Markdown">
            <button type="button" title="Заголовок" onClick={() => prefixLines('## ')}>
              H2
            </button>
            <button type="button" title="Полужирный" onClick={() => applyMarkup('**')}>
              <strong>B</strong>
            </button>
            <button type="button" title="Курсив" onClick={() => applyMarkup('_')}>
              <em>I</em>
            </button>
            <button
              type="button"
              title="Маркированный список"
              onClick={() => prefixLines('- ')}
            >
              • Список
            </button>
            <button type="button" title="Цитата" onClick={() => prefixLines('> ')}>
              ❯ Цитата
            </button>
            <button type="button" title="Код" onClick={() => applyMarkup('`')}>
              {'</>'}
            </button>
            <button
              type="button"
              title="Ссылка"
              onClick={() => applyMarkup('[', '](https://example.com)', 'ссылка')}
            >
              Ссылка
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
          <section
            className={styles.editorPane}
            aria-labelledby="markdown-source-title"
          >
            <div className={styles.paneHeader} data-testid="pane-header">
              <h2 id="markdown-source-title">Исходник</h2>
              <span>{draft.value.markdown.length.toLocaleString('ru-RU')} знаков</span>
            </div>
            <textarea
              ref={textareaRef}
              aria-label="Markdown-исходник"
              value={draft.value.markdown}
              disabled={!draft.ready}
              spellCheck
              placeholder={'# Заголовок\n\n- Первый пункт\n- Второй пункт'}
              onChange={(event) => updateMarkdown(event.target.value)}
            />
          </section>

          <section
            className={styles.previewPane}
            aria-labelledby="markdown-preview-title"
          >
            <div className={styles.paneHeader} data-testid="pane-header">
              <div
                className={styles.previewTabs}
                role="tablist"
                aria-label="Вид результата"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'preview'}
                  onClick={() => setView('preview')}
                >
                  Превью
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'html'}
                  onClick={() => setView('html')}
                >
                  HTML
                </button>
              </div>
              <label className={styles.breaksOption}>
                <input
                  type="checkbox"
                  checked={draft.value.breaks}
                  onChange={(event) =>
                    draft.setValue((current) => ({
                      ...current,
                      breaks: event.target.checked,
                    }))
                  }
                />
                Один перенос = <code>&lt;br&gt;</code>
              </label>
            </div>
            {view === 'preview' ? (
              <div
                id="markdown-preview-title"
                className={styles.markdownBody}
                dangerouslySetInnerHTML={{
                  __html:
                    html || '<p class="empty-preview">Здесь появится результат.</p>',
                }}
              />
            ) : (
              <div className={styles.htmlView}>
                <button type="button" onClick={() => void copy(html, 'HTML')}>
                  Копировать HTML
                </button>
                <pre id="markdown-preview-title">
                  <code>{html}</code>
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmClear && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => setConfirmClear(false)}
        >
          <div
            className={styles.modal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-markdown-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="clear-markdown-title">Очистить Markdown-черновик?</h2>
            <p>Текст исчезнет из редактора и локального хранилища.</p>
            <div>
              <button
                className={styles.confirmDanger}
                type="button"
                onClick={() => {
                  void draft.clear();
                  setConfirmClear(false);
                }}
              >
                Очистить
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function isMarkdownDraft(value: unknown): value is MarkdownDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'markdown' in value &&
    typeof value.markdown === 'string' &&
    'breaks' in value &&
    typeof value.breaks === 'boolean'
  );
}
