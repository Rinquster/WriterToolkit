import { useState } from 'react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { Scene, SceneId, VariantId } from '../domain';
import styles from './SceneCard.module.css';

interface SceneCardProps {
  scene: Scene;
  index: number;
  totalScenes: number;
  fontSize: number;
  onRename(sceneId: SceneId, title: string): void;
  onActivateVariant(sceneId: SceneId, variantId: VariantId): void;
  onUpdateText(sceneId: SceneId, variantId: VariantId, text: string): void;
  onAddVariant(sceneId: SceneId): void;
  onDeleteVariant(sceneId: SceneId, variantId: VariantId): void;
  onDeleteScene(sceneId: SceneId): void;
  onMove(sceneId: SceneId, index: number): void;
}

export default function SceneCard({
  scene,
  index,
  totalScenes,
  fontSize,
  onRename,
  onActivateVariant,
  onUpdateText,
  onAddVariant,
  onDeleteVariant,
  onDeleteScene,
  onMove,
}: SceneCardProps) {
  const [confirmSceneDelete, setConfirmSceneDelete] = useState(false);
  const [confirmVariantDelete, setConfirmVariantDelete] = useState(false);
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id: scene.id,
    index,
    group: 'scene-list',
    type: 'scene',
    accept: 'scene',
  });
  const activeVariant = scene.variants.find(
    (variant) => variant.id === scene.activeVariantId,
  );

  if (!activeVariant) return null;

  return (
    <article
      ref={ref}
      id={`scene-${scene.id}`}
      data-scene-id={scene.id}
      data-testid="scene-card"
      className={`${styles.card} ${isDragSource ? styles.dragging : ''} ${isDropTarget ? styles.dropTarget : ''}`}
    >
      <header className={styles.header}>
        <button
          ref={handleRef}
          className={styles.dragHandle}
          type="button"
          aria-label={`Перетащить сцену ${index + 1}. Позиция ${index + 1} из ${totalScenes}`}
          title="Перетащить сцену. С клавиатуры: Enter или пробел, затем стрелки"
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className={styles.sceneNumber} aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <label className={styles.titleField}>
          <span className={styles.visuallyHidden}>Название сцены {index + 1}</span>
          <input
            data-no-drag
            value={scene.title}
            placeholder={`Сцена ${index + 1}`}
            onChange={(event) => onRename(scene.id, event.target.value)}
          />
        </label>
        <div className={styles.sceneActions} data-no-drag>
          <button
            type="button"
            disabled={index === 0}
            aria-label={`Переместить сцену ${index + 1} выше`}
            title="Переместить выше"
            onClick={() => onMove(scene.id, index - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === totalScenes - 1}
            aria-label={`Переместить сцену ${index + 1} ниже`}
            title="Переместить ниже"
            onClick={() => onMove(scene.id, index + 1)}
          >
            ↓
          </button>
          <button
            className={styles.deleteButton}
            type="button"
            disabled={totalScenes === 1}
            aria-label={`Удалить сцену ${index + 1}`}
            title="Удалить сцену"
            onClick={() => setConfirmSceneDelete(true)}
          >
            ×
          </button>
        </div>
      </header>

      {confirmSceneDelete && (
        <div className={styles.confirmation} role="alert">
          <span>Удалить сцену {index + 1} со всеми вариантами?</span>
          <button
            className={styles.dangerAction}
            type="button"
            onClick={() => onDeleteScene(scene.id)}
          >
            Удалить
          </button>
          <button type="button" onClick={() => setConfirmSceneDelete(false)}>
            Отмена
          </button>
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.variantBar} data-no-drag>
          <div
            className={styles.variantTabs}
            role="tablist"
            aria-label={`Варианты сцены ${index + 1}`}
          >
            {scene.variants.map((variant, variantIndex) => (
              <button
                key={variant.id}
                className={
                  variant.id === scene.activeVariantId
                    ? styles.activeVariant
                    : undefined
                }
                type="button"
                role="tab"
                aria-selected={variant.id === scene.activeVariantId}
                aria-controls={`variant-panel-${scene.id}`}
                onClick={() => {
                  setConfirmVariantDelete(false);
                  onActivateVariant(scene.id, variant.id);
                }}
              >
                {variantIndex + 1}
              </button>
            ))}
            <button
              className={styles.addVariant}
              type="button"
              aria-label={`Добавить вариант в сцену ${index + 1}`}
              title="Добавить вариант"
              onClick={() => onAddVariant(scene.id)}
            >
              +
            </button>
          </div>
          <button
            className={styles.deleteVariant}
            type="button"
            disabled={scene.variants.length === 1}
            onClick={() => setConfirmVariantDelete((value) => !value)}
          >
            Удалить вариант{' '}
            {scene.variants.findIndex((item) => item.id === activeVariant.id) + 1}
          </button>
        </div>

        {confirmVariantDelete && (
          <div className={styles.variantConfirmation} role="alert">
            <span>Текст этого варианта будет удалён.</span>
            <button
              className={styles.dangerAction}
              type="button"
              onClick={() => {
                setConfirmVariantDelete(false);
                onDeleteVariant(scene.id, activeVariant.id);
              }}
            >
              Удалить
            </button>
            <button type="button" onClick={() => setConfirmVariantDelete(false)}>
              Отмена
            </button>
          </div>
        )}

        <div id={`variant-panel-${scene.id}`} role="tabpanel">
          <label className={styles.textField}>
            <span className={styles.visuallyHidden}>
              Текст активного варианта сцены {index + 1}
            </span>
            <textarea
              data-no-drag
              value={activeVariant.text}
              rows={8}
              spellCheck
              style={{ fontSize: `${fontSize}px` }}
              placeholder="Текст сцены…"
              onChange={(event) =>
                onUpdateText(scene.id, activeVariant.id, event.target.value)
              }
            />
          </label>
          <div className={styles.textMeta} aria-live="polite">
            {activeVariant.text.length.toLocaleString('ru-RU')} знаков
          </div>
        </div>
      </div>
    </article>
  );
}
