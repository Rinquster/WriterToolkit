import type { DocumentId, SceneDocument, SceneDocumentSummary } from '../domain';

export interface SceneDocumentRepository {
  list(): Promise<SceneDocumentSummary[]>;
  get(id: DocumentId): Promise<SceneDocument | undefined>;
  put(document: SceneDocument): Promise<void>;
  delete(id: DocumentId): Promise<void>;
}

export type RepositoryErrorCode =
  | 'storage-unavailable'
  | 'open-failed'
  | 'read-failed'
  | 'write-failed'
  | 'delete-failed'
  | 'invalid-document';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  override readonly cause?: unknown;

  constructor(code: RepositoryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.cause = cause;
  }
}
