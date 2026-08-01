import type {
  Clock,
  ContentProjection,
  IdProvider,
  LegacyScene,
  LegacySceneDocument,
  SceneDocument,
} from './model';
import { systemClock, systemIdProvider } from './model';
import { failure, success, type Result } from './result';
import { validateDocument } from './validation';

export type LegacyIssueCode =
  | 'invalid-json'
  | 'invalid-root'
  | 'empty-document'
  | 'invalid-scene'
  | 'invalid-scene-id'
  | 'duplicate-scene-id'
  | 'invalid-title'
  | 'invalid-active-variant'
  | 'invalid-variants'
  | 'invalid-variant'
  | 'invalid-variant-id'
  | 'duplicate-variant-id'
  | 'invalid-variant-text'
  | 'active-variant-not-found'
  | 'internal-validation-failed';

export interface LegacyDiagnostic {
  code: LegacyIssueCode;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface LegacyImportReport {
  sceneCount: number;
  variantCount: number;
  warnings: LegacyDiagnostic[];
}

export interface LegacyImportSuccess {
  document: SceneDocument;
  report: LegacyImportReport;
}

export interface LegacyImportFailure {
  diagnostics: LegacyDiagnostic[];
}

export interface LegacyImportOptions {
  name?: string;
  ids?: IdProvider;
  clock?: Clock;
}

export type LegacyImportResult = Result<LegacyImportSuccess, LegacyImportFailure>;

export function parseLegacyJson(
  source: string,
  options: LegacyImportOptions = {},
): LegacyImportResult {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    return failure({
      diagnostics: [
        {
          code: 'invalid-json',
          path: '$',
          message: 'Файл не является корректным JSON.',
          severity: 'error',
        },
      ],
    });
  }

  return fromLegacy(value, options);
}

export function fromLegacy(
  value: unknown,
  options: LegacyImportOptions = {},
): LegacyImportResult {
  const validation = validateLegacy(value);
  const errors = validation.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    return failure({ diagnostics: validation });
  }

  const legacy = value as LegacySceneDocument;
  const ids = options.ids ?? systemIdProvider;
  const clock = options.clock ?? systemClock;
  const timestamp = clock.now();

  const scenes = legacy.map((legacyScene) => {
    const legacyToInternal = new Map<number, string>();
    const variants = legacyScene.variants.map((legacyVariant) => {
      const id = ids.nextId();
      legacyToInternal.set(legacyVariant.id, id);
      return { id, text: legacyVariant.text };
    });
    const activeVariantId = legacyToInternal.get(legacyScene.activeVariant);

    if (!activeVariantId) {
      throw new Error('Legacy validation allowed a missing active variant.');
    }

    return {
      id: ids.nextId(),
      title: legacyScene.title,
      variants,
      activeVariantId,
    };
  });

  const document: SceneDocument = {
    schemaVersion: 1,
    id: ids.nextId(),
    name: options.name ?? 'Импортированный документ',
    scenes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const internalValidation = validateDocument(document);
  if (!internalValidation.valid) {
    return failure({
      diagnostics: internalValidation.issues.map((issue) => ({
        code: 'internal-validation-failed',
        path: issue.path,
        message: issue.message,
        severity: 'error',
      })),
    });
  }

  return success({
    document,
    report: {
      sceneCount: scenes.length,
      variantCount: scenes.reduce((sum, scene) => sum + scene.variants.length, 0),
      warnings: validation.filter((issue) => issue.severity === 'warning'),
    },
  });
}

export function toLegacy(
  document: SceneDocument,
): Result<LegacySceneDocument, LegacyImportFailure> {
  const validation = validateDocument(document);
  if (!validation.valid) {
    return failure({
      diagnostics: validation.issues.map((issue) => ({
        code: 'internal-validation-failed',
        path: issue.path,
        message: issue.message,
        severity: 'error',
      })),
    });
  }

  return success(
    document.scenes.map((scene, sceneIndex): LegacyScene => {
      const activeVariantIndex = scene.variants.findIndex(
        (variant) => variant.id === scene.activeVariantId,
      );
      return {
        id: sceneIndex + 1,
        title: scene.title,
        activeVariant: activeVariantIndex + 1,
        variants: scene.variants.map((variant, variantIndex) => ({
          id: variantIndex + 1,
          text: variant.text,
        })),
      };
    }),
  );
}

export function projectLegacy(document: LegacySceneDocument): ContentProjection {
  return {
    scenes: document.map((scene) => ({
      title: scene.title,
      activeVariantIndex: scene.variants.findIndex(
        (variant) => variant.id === scene.activeVariant,
      ),
      variants: scene.variants.map((variant) => ({ text: variant.text })),
    })),
  };
}

export function projectDocument(document: SceneDocument): ContentProjection {
  return {
    scenes: document.scenes.map((scene) => ({
      title: scene.title,
      activeVariantIndex: scene.variants.findIndex(
        (variant) => variant.id === scene.activeVariantId,
      ),
      variants: scene.variants.map((variant) => ({ text: variant.text })),
    })),
  };
}

export function nameFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.json$/i, '').trim();
  return withoutExtension || 'Импортированный документ';
}

function validateLegacy(value: unknown): LegacyDiagnostic[] {
  if (!Array.isArray(value)) {
    return [
      error('invalid-root', '$', 'Корень legacy-файла должен быть массивом сцен.'),
    ];
  }
  if (value.length === 0) {
    return [
      error('empty-document', '$', 'Legacy-файл должен содержать хотя бы одну сцену.'),
    ];
  }

  const diagnostics: LegacyDiagnostic[] = [];
  const sceneIds = new Set<number>();

  value.forEach((scene, sceneIndex) => {
    const path = `$[${sceneIndex}]`;
    if (!isRecord(scene)) {
      diagnostics.push(
        error('invalid-scene', path, `Сцена ${sceneIndex + 1} должна быть объектом.`),
      );
      return;
    }

    if (!isFiniteNumber(scene.id)) {
      diagnostics.push(
        error(
          'invalid-scene-id',
          `${path}.id`,
          `ID сцены ${sceneIndex + 1} должен быть конечным числом.`,
        ),
      );
    } else if (sceneIds.has(scene.id)) {
      diagnostics.push(
        warning(
          'duplicate-scene-id',
          `${path}.id`,
          `ID сцены ${scene.id} повторяется; при импорте сцена получит новый ID.`,
        ),
      );
    } else {
      sceneIds.add(scene.id);
    }

    if (typeof scene.title !== 'string') {
      diagnostics.push(
        error('invalid-title', `${path}.title`, 'Название сцены должно быть строкой.'),
      );
    }
    if (!isFiniteNumber(scene.activeVariant)) {
      diagnostics.push(
        error(
          'invalid-active-variant',
          `${path}.activeVariant`,
          'activeVariant должен быть конечным числом.',
        ),
      );
    }
    if (!Array.isArray(scene.variants) || scene.variants.length === 0) {
      diagnostics.push(
        error(
          'invalid-variants',
          `${path}.variants`,
          `Сцена ${sceneIndex + 1} должна содержать непустой массив вариантов.`,
        ),
      );
      return;
    }

    const variantIds = new Set<number>();
    let activeMatches = 0;
    scene.variants.forEach((variant, variantIndex) => {
      const variantPath = `${path}.variants[${variantIndex}]`;
      if (!isRecord(variant)) {
        diagnostics.push(
          error(
            'invalid-variant',
            variantPath,
            `Вариант ${variantIndex + 1} сцены ${sceneIndex + 1} должен быть объектом.`,
          ),
        );
        return;
      }

      if (!isFiniteNumber(variant.id)) {
        diagnostics.push(
          error(
            'invalid-variant-id',
            `${variantPath}.id`,
            'ID варианта должен быть конечным числом.',
          ),
        );
      } else if (variantIds.has(variant.id)) {
        diagnostics.push(
          error(
            'duplicate-variant-id',
            `${variantPath}.id`,
            `ID варианта ${variant.id} повторяется внутри сцены ${sceneIndex + 1}.`,
          ),
        );
      } else {
        variantIds.add(variant.id);
      }

      if (typeof variant.text !== 'string') {
        diagnostics.push(
          error(
            'invalid-variant-text',
            `${variantPath}.text`,
            'Текст варианта должен быть строкой.',
          ),
        );
      }
      if (variant.id === scene.activeVariant) {
        activeMatches += 1;
      }
    });

    if (isFiniteNumber(scene.activeVariant) && activeMatches !== 1) {
      diagnostics.push(
        error(
          'active-variant-not-found',
          `${path}.activeVariant`,
          `activeVariant сцены ${sceneIndex + 1} должен указывать ровно на один вариант.`,
        ),
      );
    }
  });

  return diagnostics;
}

function error(code: LegacyIssueCode, path: string, message: string): LegacyDiagnostic {
  return { code, path, message, severity: 'error' };
}

function warning(
  code: LegacyIssueCode,
  path: string,
  message: string,
): LegacyDiagnostic {
  return { code, path, message, severity: 'warning' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
