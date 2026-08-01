import { describe, expect, it } from 'vitest';
import { createDocument, type Clock, type IdProvider } from '../domain';
import { MemorySceneDocumentRepository } from './memoryRepository';

class SequenceIds implements IdProvider {
  private next = 0;
  nextId = () => `repository-id-${++this.next}`;
}

const clock: Clock = { now: () => '2026-08-01T09:00:00.000Z' };

describe('scene document repository contract', () => {
  it('stores defensive copies and returns summaries', async () => {
    const repository = new MemorySceneDocumentRepository();
    const document = createDocument('Роман', { ids: new SequenceIds(), clock });
    await repository.put(document);

    document.scenes[0]!.title = 'Изменено снаружи';
    const loaded = await repository.get(document.id);
    expect(loaded?.scenes[0]?.title).toBe('Сцена 1');

    loaded!.scenes[0]!.title = 'Изменено после чтения';
    expect((await repository.get(document.id))?.scenes[0]?.title).toBe('Сцена 1');
    expect(await repository.list()).toEqual([
      expect.objectContaining({ name: 'Роман', sceneCount: 1, variantCount: 1 }),
    ]);
  });

  it('rejects an invalid document before writing', async () => {
    const repository = new MemorySceneDocumentRepository();
    const document = createDocument('Роман', { ids: new SequenceIds(), clock });
    document.scenes = [];

    await expect(repository.put(document)).rejects.toMatchObject({
      code: 'invalid-document',
    });
    expect(await repository.list()).toEqual([]);
  });

  it('deletes only the selected document', async () => {
    const ids = new SequenceIds();
    const first = createDocument('Первый', { ids, clock });
    const second = createDocument('Второй', { ids, clock });
    const repository = new MemorySceneDocumentRepository([first, second]);

    await repository.delete(first.id);
    expect(await repository.get(first.id)).toBeUndefined();
    expect((await repository.list()).map((item) => item.name)).toEqual(['Второй']);
  });
});
