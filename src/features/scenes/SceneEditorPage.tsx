import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { isSortable } from '@dnd-kit/react/sortable';
import { Link, useNavigate, useParams } from 'react-router';
import { AppHeaderPortal } from '../../app/AppHeaderPortal';
import StatusBadge from '../../design-system/components/StatusBadge';
import { downloadTextFile, safeFilename } from '../../infrastructure/files/download';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { useSceneEditor } from './application/useSceneEditor';
import SceneCard from './components/SceneCard';
import {
  activateVariant,
  addScene,
  addVariant,
  deleteScene,
  deleteVariant,
  moveScene,
  renameDocument,
  renameScene,
  toLegacy,
  updateVariantText,
  type SceneDocument,
  type SceneId,
  type VariantId,
} from './domain';
import styles from './SceneEditorPage.module.css';

interface SearchResult {
  sceneId: SceneId;
  variantId: VariantId;
  start: number;
}

export default function SceneEditorPage() {
  const { documentId } = useParams();
  const editor = useSceneEditor(documentId);
  const document = editor.document;
  useDocumentTitle(document?.name || 'Редактор сцен');

  if (editor.loadState === 'loading') {
    return <div className={styles.routeState}>Открываем документ…</div>;
  }

  if (editor.loadState === 'not-found') {
    return (
      <div className={styles.routeState}>
        <h1>Документ не найден</h1>
        <p>Возможно, он был создан в другом браузере или удалён.</p>
        <Link to="/scenes">Вернуться к документам</Link>
      </div>
    );
  }

  if (editor.loadState === 'error' || !document) {
    return (
      <div className={styles.routeState} role="alert">
        <h1>Не удалось открыть документ</h1>
        <p>{editor.error}</p>
        <Link to="/scenes">Вернуться к документам</Link>
      </div>
    );
  }

  return <LoadedSceneEditor document={document} editor={editor} />;
}

interface LoadedSceneEditorProps {
  document: SceneDocument;
  editor: ReturnType<typeof useSceneEditor>;
}

function LoadedSceneEditor({ document, editor }: LoadedSceneEditorProps) {
  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(readFontSize);
  const [query, setQuery] = useState('');
  const [currentResult, setCurrentResult] = useState(-1);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchResults = useMemo(
    () => searchDocument(document, query),
    [document, query],
  );

  useEffect(() => {
    localStorage.setItem('scene-editor-font-size-v2', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const moveToSearchResult = (direction: 1 | -1) => {
    if (searchResults.length === 0) return;
    const safeCurrentResult =
      currentResult >= 0 && currentResult < searchResults.length ? currentResult : -1;
    const next =
      safeCurrentResult === -1
        ? direction === 1
          ? 0
          : searchResults.length - 1
        : (safeCurrentResult + direction + searchResults.length) % searchResults.length;
    const result = searchResults[next];
    if (!result) return;
    setCurrentResult(next);
    editor.apply(activateVariant(document, result.sceneId, result.variantId), {
      recordHistory: false,
    });
    window.setTimeout(() => focusSearchResult(result, query.length), 0);
  };

  const handleExport = () => {
    const legacy = toLegacy(document);
    if (!legacy.ok) return;
    downloadTextFile(
      JSON.stringify(legacy.value, null, 2),
      `${safeFilename(document.name, 'scenes')}.json`,
      'application/json;charset=utf-8',
    );
  };

  const handleMove = (sceneId: SceneId, targetIndex: number) => {
    const sourceIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
    if (sourceIndex === targetIndex) return;
    if (editor.apply(moveScene(document, sceneId, targetIndex), { immediate: true })) {
      setAnnouncement(
        `Сцена перемещена с позиции ${sourceIndex + 1} на позицию ${targetIndex + 1}.`,
      );
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLocaleLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        editor.redo();
      } else if (key === 'z') {
        event.preventDefault();
        editor.undo();
      } else if (key === 'y') {
        event.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [editor]);

  return (
    <div className={styles.editor}>
      <AppHeaderPortal>
        <div className={styles.headerContent}>
          <div className={styles.headerMain}>
            <button
              className={styles.backLink}
              type="button"
              aria-label="Вернуться к документам"
              onClick={() => {
                void editor.flush().then(() => navigate('/scenes'));
              }}
            >
              <span className={styles.backArrow} aria-hidden="true">
                ←
              </span>
              <span className={styles.backText}>Документы</span>
            </button>
            <label className={styles.documentName}>
              <span className={styles.visuallyHidden}>Название документа</span>
              <input
                value={document.name}
                placeholder="Без названия"
                onChange={(event) =>
                  editor.apply(renameDocument(document, event.target.value), {
                    historyGroup: 'document-name',
                  })
                }
              />
            </label>
            <span className={styles.saveStatus}>
              <SaveBadge state={editor.saveState} />
            </span>
          </div>

          <div className={styles.toolbar} aria-label="Инструменты документа">
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => editor.apply(addScene(document), { immediate: true })}
            >
              + Сцена
            </button>
            <button
              ref={searchToggleRef}
              className={isSearchOpen ? styles.toggleActive : undefined}
              type="button"
              aria-label={isSearchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
              aria-expanded={isSearchOpen}
              aria-controls="scene-search"
              onClick={() => setIsSearchOpen((value) => !value)}
            >
              {isSearchOpen ? '× Поиск' : '⌕ Поиск'}
            </button>
            <button type="button" disabled={!editor.canUndo} onClick={editor.undo}>
              ↶ Отменить
            </button>
            <button type="button" disabled={!editor.canRedo} onClick={editor.redo}>
              ↷ Вернуть
            </button>
            <button type="button" onClick={handleExport}>
              Экспорт JSON
            </button>
            <div className={styles.fontControl}>
              <span>Шрифт</span>
              <button
                type="button"
                disabled={fontSize <= 10}
                aria-label="Уменьшить шрифт редактора"
                onClick={() => setFontSize((value) => Math.max(10, value - 1))}
              >
                −
              </button>
              <output>{fontSize}</output>
              <button
                type="button"
                disabled={fontSize >= 32}
                aria-label="Увеличить шрифт редактора"
                onClick={() => setFontSize((value) => Math.min(32, value + 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </AppHeaderPortal>

      {isSearchOpen && (
        <div id="scene-search" className={styles.searchBar} role="search">
          <label>
            <span className={styles.visuallyHidden}>Поиск по всем вариантам</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              placeholder="Поиск по всем вариантам…"
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentResult(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsSearchOpen(false);
                  window.requestAnimationFrame(() => searchToggleRef.current?.focus());
                }
              }}
            />
          </label>
          <span className={styles.resultCount} aria-live="polite">
            {query
              ? `${searchResults.length} совпадений`
              : `${document.scenes.length} сцен`}
          </span>
          <button
            type="button"
            disabled={searchResults.length === 0}
            aria-label="Предыдущее совпадение"
            onClick={() => moveToSearchResult(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={searchResults.length === 0}
            aria-label="Следующее совпадение"
            onClick={() => moveToSearchResult(1)}
          >
            ↓
          </button>
        </div>
      )}

      {(editor.error || editor.commandError) && (
        <div className={styles.errorBanner} role="alert">
          <span>{editor.commandError ?? editor.error}</span>
          {editor.saveState === 'error' && (
            <button type="button" onClick={editor.retrySave}>
              Повторить сохранение
            </button>
          )}
        </div>
      )}

      <section className={styles.sceneArea} aria-label="Сцены документа">
        <DragDropProvider
          onDragStart={(event) => {
            const source = event.operation.source;
            const index = document.scenes.findIndex((scene) => scene.id === source?.id);
            if (index >= 0) setAnnouncement(`Поднята сцена ${index + 1}.`);
          }}
          onDragEnd={(event) => {
            if (event.canceled) {
              setAnnouncement('Перемещение отменено.');
              return;
            }
            const source = event.operation.source;
            if (isSortable(source) && typeof source.id === 'string') {
              handleMove(source.id, source.index);
            }
          }}
        >
          <div className={styles.sceneList} data-testid="scene-list">
            {document.scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                index={index}
                totalScenes={document.scenes.length}
                fontSize={fontSize}
                onRename={(sceneId, title) =>
                  editor.apply(renameScene(document, sceneId, title), {
                    historyGroup: `scene-title-${sceneId}`,
                  })
                }
                onActivateVariant={(sceneId, variantId) =>
                  editor.apply(activateVariant(document, sceneId, variantId))
                }
                onUpdateText={(sceneId, variantId, text) =>
                  editor.apply(updateVariantText(document, sceneId, variantId, text), {
                    historyGroup: `variant-text-${sceneId}-${variantId}`,
                  })
                }
                onAddVariant={(sceneId) =>
                  editor.apply(addVariant(document, sceneId), { immediate: true })
                }
                onDeleteVariant={(sceneId, variantId) =>
                  editor.apply(deleteVariant(document, sceneId, variantId), {
                    immediate: true,
                  })
                }
                onDeleteScene={(sceneId) =>
                  editor.apply(deleteScene(document, sceneId), { immediate: true })
                }
                onMove={handleMove}
              />
            ))}
          </div>
        </DragDropProvider>
      </section>

      <div className={styles.visuallyHidden} aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

function SaveBadge({
  state,
}: {
  state: ReturnType<typeof useSceneEditor>['saveState'];
}) {
  if (state === 'clean') return <StatusBadge tone="success">Сохранено</StatusBadge>;
  if (state === 'error')
    return <StatusBadge tone="warning">Ошибка сохранения</StatusBadge>;
  return (
    <StatusBadge tone="accent">
      {state === 'saving' ? 'Сохраняем…' : 'Есть изменения'}
    </StatusBadge>
  );
}

function searchDocument(document: SceneDocument, query: string): SearchResult[] {
  if (!query) return [];
  const normalizedQuery = query.toLocaleLowerCase('ru-RU');
  const results: SearchResult[] = [];

  document.scenes.forEach((scene) => {
    scene.variants.forEach((variant) => {
      const text = variant.text.toLocaleLowerCase('ru-RU');
      let from = 0;
      while (from <= text.length) {
        const start = text.indexOf(normalizedQuery, from);
        if (start === -1) break;
        results.push({ sceneId: scene.id, variantId: variant.id, start });
        from = start + Math.max(normalizedQuery.length, 1);
      }
    });
  });
  return results;
}

function focusSearchResult(result: SearchResult, length: number): void {
  const card = document.querySelector<HTMLElement>(
    `[data-scene-id="${CSS.escape(result.sceneId)}"]`,
  );
  const textarea = card?.querySelector('textarea');
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  textarea?.focus();
  textarea?.setSelectionRange(result.start, result.start + length);
}

function readFontSize(): number {
  const saved = Number.parseInt(
    localStorage.getItem('scene-editor-font-size-v2') ?? '',
    10,
  );
  return Number.isInteger(saved) && saved >= 10 && saved <= 32 ? saved : 16;
}
