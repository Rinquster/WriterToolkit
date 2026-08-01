export type DocumentId = string;
export type SceneId = string;
export type VariantId = string;

export interface Variant {
  id: VariantId;
  text: string;
}

export interface Scene {
  id: SceneId;
  title: string;
  variants: Variant[];
  activeVariantId: VariantId;
}

export interface SceneDocument {
  schemaVersion: 1;
  id: DocumentId;
  name: string;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneDocumentSummary {
  id: DocumentId;
  name: string;
  sceneCount: number;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyVariant {
  id: number;
  text: string;
}

export interface LegacyScene {
  id: number;
  title: string;
  activeVariant: number;
  variants: LegacyVariant[];
}

export type LegacySceneDocument = LegacyScene[];

export interface ContentProjection {
  scenes: Array<{
    title: string;
    activeVariantIndex: number;
    variants: Array<{ text: string }>;
  }>;
}

export interface IdProvider {
  nextId(): string;
}

export interface Clock {
  now(): string;
}

export const systemIdProvider: IdProvider = {
  nextId: () => crypto.randomUUID(),
};

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export function cloneDocument(document: SceneDocument): SceneDocument {
  return structuredClone(document);
}

export function summarizeDocument(document: SceneDocument): SceneDocumentSummary {
  return {
    id: document.id,
    name: document.name,
    sceneCount: document.scenes.length,
    variantCount: document.scenes.reduce(
      (sum, scene) => sum + scene.variants.length,
      0,
    ),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
