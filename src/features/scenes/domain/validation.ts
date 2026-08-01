import type { SceneDocument } from './model';

export type ValidationCode =
  | 'invalid-schema-version'
  | 'invalid-document-id'
  | 'invalid-document-name'
  | 'invalid-timestamp'
  | 'empty-document'
  | 'invalid-scene-id'
  | 'duplicate-id'
  | 'invalid-scene-title'
  | 'empty-variants'
  | 'invalid-variant-id'
  | 'invalid-variant-text'
  | 'missing-active-variant';

export interface DomainValidationIssue {
  code: ValidationCode;
  path: string;
  message: string;
}

export interface DomainValidationResult {
  valid: boolean;
  issues: DomainValidationIssue[];
}

export function validateDocument(value: unknown): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        {
          code: 'invalid-document-id',
          path: '$',
          message: 'Документ должен быть объектом.',
        },
      ],
    };
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      code: 'invalid-schema-version',
      path: '$.schemaVersion',
      message: 'Поддерживается только schemaVersion 1.',
    });
  }

  validateString(
    value.id,
    '$.id',
    'invalid-document-id',
    'ID документа',
    issues,
    false,
  );
  validateString(
    value.name,
    '$.name',
    'invalid-document-name',
    'Название документа',
    issues,
  );
  validateTimestamp(value.createdAt, '$.createdAt', issues);
  validateTimestamp(value.updatedAt, '$.updatedAt', issues);

  if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
    issues.push({
      code: 'empty-document',
      path: '$.scenes',
      message: 'Документ должен содержать хотя бы одну сцену.',
    });
    return { valid: false, issues };
  }

  const allIds = new Set<string>();
  if (typeof value.id === 'string' && value.id.length > 0) {
    allIds.add(value.id);
  }
  const document = value as unknown as SceneDocument;

  document.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `$.scenes[${sceneIndex}]`;
    if (!isRecord(scene)) {
      issues.push({
        code: 'invalid-scene-id',
        path: scenePath,
        message: `Сцена ${sceneIndex + 1} должна быть объектом.`,
      });
      return;
    }

    validateUniqueId(
      scene.id,
      `${scenePath}.id`,
      'invalid-scene-id',
      'сцены',
      allIds,
      issues,
    );
    validateString(
      scene.title,
      `${scenePath}.title`,
      'invalid-scene-title',
      'Название сцены',
      issues,
    );

    if (!Array.isArray(scene.variants) || scene.variants.length === 0) {
      issues.push({
        code: 'empty-variants',
        path: `${scenePath}.variants`,
        message: `Сцена ${sceneIndex + 1} должна содержать хотя бы один вариант.`,
      });
      return;
    }

    let activeVariantExists = false;
    scene.variants.forEach((variant, variantIndex) => {
      const variantPath = `${scenePath}.variants[${variantIndex}]`;
      if (!isRecord(variant)) {
        issues.push({
          code: 'invalid-variant-id',
          path: variantPath,
          message: `Вариант ${variantIndex + 1} сцены ${sceneIndex + 1} должен быть объектом.`,
        });
        return;
      }

      validateUniqueId(
        variant.id,
        `${variantPath}.id`,
        'invalid-variant-id',
        'варианта',
        allIds,
        issues,
      );
      validateString(
        variant.text,
        `${variantPath}.text`,
        'invalid-variant-text',
        'Текст варианта',
        issues,
      );

      if (variant.id === scene.activeVariantId) {
        activeVariantExists = true;
      }
    });

    if (!activeVariantExists) {
      issues.push({
        code: 'missing-active-variant',
        path: `${scenePath}.activeVariantId`,
        message: `Активный вариант сцены ${sceneIndex + 1} отсутствует в её списке вариантов.`,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}

function validateTimestamp(
  value: unknown,
  path: string,
  issues: DomainValidationIssue[],
): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    issues.push({
      code: 'invalid-timestamp',
      path,
      message: 'Дата должна быть непустой строкой в формате, понятном Date.parse.',
    });
  }
}

function validateUniqueId(
  value: unknown,
  path: string,
  invalidCode: 'invalid-scene-id' | 'invalid-variant-id',
  label: string,
  ids: Set<string>,
  issues: DomainValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({
      code: invalidCode,
      path,
      message: `ID ${label} должен быть непустой строкой.`,
    });
    return;
  }

  if (ids.has(value)) {
    issues.push({
      code: 'duplicate-id',
      path,
      message: `ID ${label} «${value}» уже используется в документе.`,
    });
    return;
  }

  ids.add(value);
}

function validateString(
  value: unknown,
  path: string,
  code:
    | 'invalid-document-id'
    | 'invalid-document-name'
    | 'invalid-scene-title'
    | 'invalid-variant-text',
  label: string,
  issues: DomainValidationIssue[],
  allowEmpty = true,
): void {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    issues.push({
      code,
      path,
      message: `${label} ${allowEmpty ? 'должно быть строкой' : 'должен быть непустой строкой'}.`,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
