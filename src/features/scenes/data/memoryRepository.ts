import {
  cloneDocument,
  summarizeDocument,
  validateDocument,
  type DocumentId,
  type SceneDocument,
  type SceneDocumentSummary,
} from '../domain';
import { RepositoryError, type SceneDocumentRepository } from './repository';

export class MemorySceneDocumentRepository implements SceneDocumentRepository {
  private readonly documents = new Map<DocumentId, SceneDocument>();

  constructor(seed: SceneDocument[] = []) {
    seed.forEach((document) =>
      this.documents.set(document.id, cloneDocument(document)),
    );
  }

  async list(): Promise<SceneDocumentSummary[]> {
    return [...this.documents.values()]
      .map((document) => summarizeDocument(document))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: DocumentId): Promise<SceneDocument | undefined> {
    const document = this.documents.get(id);
    return document ? cloneDocument(document) : undefined;
  }

  async put(document: SceneDocument): Promise<void> {
    const validation = validateDocument(document);
    if (!validation.valid) {
      throw new RepositoryError(
        'invalid-document',
        'Невалидный документ не был записан в хранилище.',
        validation.issues,
      );
    }
    this.documents.set(document.id, cloneDocument(document));
  }

  async delete(id: DocumentId): Promise<void> {
    this.documents.delete(id);
  }
}
