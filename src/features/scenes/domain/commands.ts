import type {
  Clock,
  IdProvider,
  Scene,
  SceneDocument,
  SceneId,
  VariantId,
} from './model';
import { systemClock, systemIdProvider } from './model';
import { failure, success, type Result } from './result';
import { validateDocument, type DomainValidationIssue } from './validation';

export type SceneCommandErrorCode =
  | 'scene-not-found'
  | 'variant-not-found'
  | 'last-scene'
  | 'last-variant'
  | 'invalid-position'
  | 'invalid-order'
  | 'invalid-document';

export interface SceneCommandError {
  code: SceneCommandErrorCode;
  message: string;
  issues?: DomainValidationIssue[];
}

export type SceneCommandResult = Result<SceneDocument, SceneCommandError>;

export interface DomainServices {
  ids?: IdProvider;
  clock?: Clock;
}

export function createDocument(
  name = 'Новый документ',
  services: DomainServices = {},
): SceneDocument {
  const ids = services.ids ?? systemIdProvider;
  const clock = services.clock ?? systemClock;
  const variantId = ids.nextId();
  const timestamp = clock.now();

  return {
    schemaVersion: 1,
    id: ids.nextId(),
    name,
    scenes: [
      {
        id: ids.nextId(),
        title: 'Сцена 1',
        variants: [{ id: variantId, text: '' }],
        activeVariantId: variantId,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function renameDocument(
  document: SceneDocument,
  name: string,
  clock: Clock = systemClock,
): SceneCommandResult {
  return commit(document, { ...document, name }, clock);
}

export function addScene(
  document: SceneDocument,
  services: DomainServices = {},
): SceneCommandResult {
  const ids = services.ids ?? systemIdProvider;
  const variantId = ids.nextId();
  const scene: Scene = {
    id: ids.nextId(),
    title: `Сцена ${document.scenes.length + 1}`,
    variants: [{ id: variantId, text: '' }],
    activeVariantId: variantId,
  };

  return commit(
    document,
    { ...document, scenes: [...document.scenes, scene] },
    services.clock ?? systemClock,
  );
}

export function renameScene(
  document: SceneDocument,
  sceneId: SceneId,
  title: string,
  clock: Clock = systemClock,
): SceneCommandResult {
  return updateScene(document, sceneId, (scene) => ({ ...scene, title }), clock);
}

export function deleteScene(
  document: SceneDocument,
  sceneId: SceneId,
  clock: Clock = systemClock,
): SceneCommandResult {
  if (document.scenes.length === 1) {
    return failure({
      code: 'last-scene',
      message: 'Нельзя удалить единственную сцену.',
    });
  }

  const sceneIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return sceneNotFound(sceneId);
  }

  const scenes = document.scenes.filter((scene) => scene.id !== sceneId);
  return commit(document, { ...document, scenes }, clock);
}

export function moveScene(
  document: SceneDocument,
  sceneId: SceneId,
  toIndex: number,
  clock: Clock = systemClock,
): SceneCommandResult {
  const fromIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
  if (fromIndex === -1) {
    return sceneNotFound(sceneId);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= document.scenes.length) {
    return failure({
      code: 'invalid-position',
      message: `Позиция ${toIndex} находится за пределами списка сцен.`,
    });
  }
  if (fromIndex === toIndex) {
    return success(document);
  }

  const scenes = [...document.scenes];
  const [moved] = scenes.splice(fromIndex, 1);
  if (!moved) {
    return sceneNotFound(sceneId);
  }
  scenes.splice(toIndex, 0, moved);
  return commit(document, { ...document, scenes }, clock);
}

export function setSceneOrder(
  document: SceneDocument,
  orderedIds: SceneId[],
  clock: Clock = systemClock,
): SceneCommandResult {
  const existingIds = new Set(document.scenes.map((scene) => scene.id));
  const suppliedIds = new Set(orderedIds);

  if (
    orderedIds.length !== document.scenes.length ||
    suppliedIds.size !== orderedIds.length ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    return failure({
      code: 'invalid-order',
      message: 'Новый порядок должен содержать ID всех сцен ровно по одному разу.',
    });
  }

  const byId = new Map(document.scenes.map((scene) => [scene.id, scene]));
  const scenes = orderedIds
    .map((id) => byId.get(id))
    .filter((scene): scene is Scene => Boolean(scene));
  return commit(document, { ...document, scenes }, clock);
}

export function addVariant(
  document: SceneDocument,
  sceneId: SceneId,
  services: DomainServices = {},
): SceneCommandResult {
  const ids = services.ids ?? systemIdProvider;
  const variant = { id: ids.nextId(), text: '' };

  return updateScene(
    document,
    sceneId,
    (scene) => ({
      ...scene,
      variants: [...scene.variants, variant],
      activeVariantId: variant.id,
    }),
    services.clock ?? systemClock,
  );
}

export function activateVariant(
  document: SceneDocument,
  sceneId: SceneId,
  variantId: VariantId,
  clock: Clock = systemClock,
): SceneCommandResult {
  return updateScene(
    document,
    sceneId,
    (scene) => {
      if (!scene.variants.some((variant) => variant.id === variantId)) {
        return failure({
          code: 'variant-not-found',
          message: `Вариант «${variantId}» не найден в выбранной сцене.`,
        });
      }
      return { ...scene, activeVariantId: variantId };
    },
    clock,
  );
}

export function updateVariantText(
  document: SceneDocument,
  sceneId: SceneId,
  variantId: VariantId,
  text: string,
  clock: Clock = systemClock,
): SceneCommandResult {
  return updateScene(
    document,
    sceneId,
    (scene) => {
      if (!scene.variants.some((variant) => variant.id === variantId)) {
        return failure({
          code: 'variant-not-found',
          message: `Вариант «${variantId}» не найден в выбранной сцене.`,
        });
      }
      return {
        ...scene,
        variants: scene.variants.map((variant) =>
          variant.id === variantId ? { ...variant, text } : variant,
        ),
      };
    },
    clock,
  );
}

export function deleteVariant(
  document: SceneDocument,
  sceneId: SceneId,
  variantId: VariantId,
  clock: Clock = systemClock,
): SceneCommandResult {
  return updateScene(
    document,
    sceneId,
    (scene) => {
      if (scene.variants.length === 1) {
        return failure({
          code: 'last-variant',
          message: 'Нельзя удалить единственный вариант.',
        });
      }

      const deletedIndex = scene.variants.findIndex(
        (variant) => variant.id === variantId,
      );
      if (deletedIndex === -1) {
        return failure({
          code: 'variant-not-found',
          message: `Вариант «${variantId}» не найден в выбранной сцене.`,
        });
      }

      const variants = scene.variants.filter((variant) => variant.id !== variantId);
      const replacement = variants[Math.min(deletedIndex, variants.length - 1)];
      return {
        ...scene,
        variants,
        activeVariantId:
          scene.activeVariantId === variantId && replacement
            ? replacement.id
            : scene.activeVariantId,
      };
    },
    clock,
  );
}

type SceneUpdate = Scene | Result<never, SceneCommandError>;

function updateScene(
  document: SceneDocument,
  sceneId: SceneId,
  update: (scene: Scene) => SceneUpdate,
  clock: Clock,
): SceneCommandResult {
  const sceneIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return sceneNotFound(sceneId);
  }

  const scene = document.scenes[sceneIndex];
  if (!scene) {
    return sceneNotFound(sceneId);
  }

  const updated = update(scene);
  if (isFailure(updated)) {
    return updated;
  }

  const scenes = document.scenes.map((item, index) =>
    index === sceneIndex ? updated : item,
  );
  return commit(document, { ...document, scenes }, clock);
}

function commit(
  original: SceneDocument,
  candidate: SceneDocument,
  clock: Clock,
): SceneCommandResult {
  const updated =
    candidate === original ? original : { ...candidate, updatedAt: clock.now() };
  const validation = validateDocument(updated);
  if (!validation.valid) {
    return failure({
      code: 'invalid-document',
      message: 'Операция создала невалидный документ и была отменена.',
      issues: validation.issues,
    });
  }
  return success(updated);
}

function isFailure(value: SceneUpdate): value is Result<never, SceneCommandError> {
  return 'ok' in value && value.ok === false;
}

function sceneNotFound(sceneId: SceneId): Result<never, SceneCommandError> {
  return failure({
    code: 'scene-not-found',
    message: `Сцена «${sceneId}» не найдена.`,
  });
}
