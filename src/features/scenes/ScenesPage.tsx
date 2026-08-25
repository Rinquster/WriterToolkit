import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import AppHeaderContent from '../../design-system/components/AppHeaderContent';
import StatusBadge from '../../design-system/components/StatusBadge';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useSceneLibrary } from './application';
import {
  nameFromFilename,
  parseLegacyJson,
  type LegacyDiagnostic,
  type LegacyImportReport,
  type SceneDocument,
  type SceneDocumentSummary,
} from './domain';
import styles from './ScenesPage.module.css';

interface PendingImport {
  document: SceneDocument;
  filename: string;
  report: LegacyImportReport;
}

export default function ScenesPage() {
  useDocumentTitle('Документы сцен');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const library = useSceneLibrary();
  const [readingFile, setReadingFile] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport>();
  const [pendingDelete, setPendingDelete] = useState<SceneDocumentSummary>();
  const [importDiagnostics, setImportDiagnostics] = useState<LegacyDiagnostic[]>([]);

  const handleCreate = async () => {
    try {
      const document = await library.create();
      void navigate(`/scenes/${document.id}`);
    } catch {
      // The hook exposes a user-facing error in the page.
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReadingFile(true);
    setImportDiagnostics([]);
    setPendingImport(undefined);
    try {
      const source = await file.text();
      const result = parseLegacyJson(source, { name: nameFromFilename(file.name) });
      if (!result.ok) {
        setImportDiagnostics(result.error.diagnostics);
        return;
      }
      setPendingImport({
        document: result.value.document,
        filename: file.name,
        report: result.value.report,
      });
    } catch {
      setImportDiagnostics([
        {
          code: 'invalid-json',
          path: '$',
          message:
            'Браузер не смог прочитать выбранный файл. Исходный файл не изменён.',
          severity: 'error',
        },
      ]);
    } finally {
      setReadingFile(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      await library.importDocument(pendingImport.document);
      void navigate(`/scenes/${pendingImport.document.id}`);
    } catch {
      // The hook exposes a user-facing error in the page.
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await library.deleteDocument(pendingDelete.id);
      setPendingDelete(undefined);
    } catch {
      // The hook exposes a user-facing error in the page.
    }
  };

  return (
    <>
      <AppHeaderContent
        title="Документы сцен"
        status={<StatusBadge tone="success">Локально</StatusBadge>}
        actions={
          <div className={styles.actionButtons}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={library.busy || readingFile}
              onClick={() => void handleCreate()}
            >
              Новый документ
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={library.busy || readingFile}
              onClick={() => fileInputRef.current?.click()}
            >
              {readingFile ? 'Проверяем…' : 'Импортировать JSON'}
            </button>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleFile(event)}
            />
          </div>
        }
      />

      <div className={styles.content}>
        {importDiagnostics.length > 0 && (
          <section
            className={styles.errorPanel}
            role="alert"
            aria-labelledby="import-error-title"
          >
            <h2 id="import-error-title">Импорт отменён</h2>
            <p>
              Файл не записан в хранилище. Исправьте структуру JSON и попробуйте снова.
            </p>
            <ul>
              {importDiagnostics.slice(0, 8).map((diagnostic, index) => (
                <li key={`${diagnostic.path}-${diagnostic.code}-${index}`}>
                  <code>{diagnostic.path}</code> — {diagnostic.message}
                </li>
              ))}
            </ul>
            {importDiagnostics.length > 8 && (
              <p>И ещё ошибок: {importDiagnostics.length - 8}.</p>
            )}
          </section>
        )}

        {pendingImport && (
          <section className={styles.importPanel} aria-labelledby="import-title">
            <div>
              <p className={styles.kicker}>Файл проверен</p>
              <h2 id="import-title">Импортировать «{pendingImport.document.name}»?</h2>
              <p className={styles.fileName}>{pendingImport.filename}</p>
            </div>
            <dl className={styles.importStats}>
              <div>
                <dt>Сцен</dt>
                <dd>{pendingImport.report.sceneCount}</dd>
              </div>
              <div>
                <dt>Вариантов</dt>
                <dd>{pendingImport.report.variantCount}</dd>
              </div>
              <div>
                <dt>Предупреждений</dt>
                <dd>{pendingImport.report.warnings.length}</dd>
              </div>
            </dl>
            {pendingImport.report.warnings.length > 0 && (
              <ul className={styles.warningList}>
                {pendingImport.report.warnings.map((warning, index) => (
                  <li key={`${warning.path}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            )}
            <div className={styles.confirmActions}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={library.busy}
                onClick={() => void confirmImport()}
              >
                {library.busy ? 'Сохраняем…' : 'Импортировать как новый'}
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                disabled={library.busy}
                onClick={() => setPendingImport(undefined)}
              >
                Отмена
              </button>
            </div>
          </section>
        )}

        {library.error && (
          <div className={styles.storageError} role="alert">
            <strong>Локальное хранилище недоступно.</strong> {library.error}
          </div>
        )}

        <section className={styles.library} aria-labelledby="library-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Этот браузер</p>
              <h2 id="library-title">Ваши документы</h2>
            </div>
            {!library.loading && <span>{library.documents.length}</span>}
          </div>

          {library.loading ? (
            <p className={styles.emptyState} role="status">
              Открываем локальную библиотеку…
            </p>
          ) : library.documents.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Пока пусто</h3>
              <p>
                Создайте первый документ или импортируйте JSON.
              </p>
            </div>
          ) : (
            <ul className={styles.documentGrid}>
              {library.documents.map((document) => (
                <li key={document.id} className={styles.documentItem}>
                  <Link className={styles.documentCard} to={`/scenes/${document.id}`}>
                    <div className={styles.documentTopline}>
                      <span>{formatDate(document.updatedAt)}</span>
                      <span aria-label={`${document.sceneCount} сцен`}>
                        {document.sceneCount} сцен
                      </span>
                    </div>
                    <h3>{document.name || 'Без названия'}</h3>
                    <p>
                      {document.variantCount} {pluralizeVariant(document.variantCount)}
                    </p>
                    <span className={styles.openLabel}>Открыть →</span>
                  </Link>
                  <button
                    className={styles.deleteDocument}
                    type="button"
                    aria-label={`Удалить документ «${document.name || 'Без названия'}»`}
                    title="Удалить документ"
                    onClick={() => setPendingDelete(document)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {library.recoveries.length > 0 && (
          <section className={styles.recovery} aria-labelledby="recovery-title">
            <div>
              <p className={styles.kicker}>Страховка от ошибки</p>
              <h2 id="recovery-title">Недавно удалённые</h2>
              <p>Хранятся локально; остаются только 10 последних резервных копий.</p>
            </div>
            <ul>
              {library.recoveries.map((snapshot) => (
                <li key={snapshot.id}>
                  <div>
                    <strong>{snapshot.name || 'Без названия'}</strong>
                    <span>
                      {snapshot.sceneCount} сцен · удалён{' '}
                      {formatDate(snapshot.deletedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={library.busy}
                    onClick={() => void library.restore(snapshot.id)}
                  >
                    Восстановить
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {pendingDelete && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => setPendingDelete(undefined)}
        >
          <div
            className={styles.modal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-document-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-document-title">
              Удалить «{pendingDelete.name || 'Без названия'}»?
            </h2>
            <p>
              Документ исчезнет из библиотеки, но WriterToolkit оставит локальную
              резервную копию для восстановления.
            </p>
            <dl>
              <div>
                <dt>Сцен</dt>
                <dd>{pendingDelete.sceneCount}</dd>
              </div>
              <div>
                <dt>Вариантов</dt>
                <dd>{pendingDelete.variantCount}</dd>
              </div>
            </dl>
            <div className={styles.modalActions}>
              <button
                className={styles.confirmDelete}
                type="button"
                disabled={library.busy}
                onClick={() => void confirmDelete()}
              >
                {library.busy ? 'Удаляем…' : 'Удалить'}
              </button>
              <button
                type="button"
                disabled={library.busy}
                onClick={() => setPendingDelete(undefined)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function pluralizeVariant(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'вариантов';
  if (last === 1) return 'вариант';
  if (last >= 2 && last <= 4) return 'варианта';
  return 'вариантов';
}
