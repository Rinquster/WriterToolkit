import { describe, expect, it } from 'vitest';
import type { Clock, IdProvider } from './model';
import {
  activateVariant,
  addScene,
  addVariant,
  createDocument,
  deleteScene,
  deleteVariant,
  moveScene,
  renameScene,
  updateVariantText,
} from './commands';
import { validateDocument } from './validation';

class SequenceIds implements IdProvider {
  private next = 0;
  nextId = () => `generated-${++this.next}`;
}

class SequenceClock implements Clock {
  private tick = 0;
  now = () => `2026-08-01T09:00:0${this.tick++}.000Z`;
}

describe('scene domain commands', () => {
  it('creates a valid minimal document', () => {
    const document = createDocument('Роман', {
      ids: new SequenceIds(),
      clock: new SequenceClock(),
    });
    expect(document.name).toBe('Роман');
    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0]?.variants).toHaveLength(1);
    expect(validateDocument(document)).toEqual({ valid: true, issues: [] });
  });

  it('updates text immutably and keeps the original untouched', () => {
    const document = createDocument('Роман', {
      ids: new SequenceIds(),
      clock: new SequenceClock(),
    });
    const scene = document.scenes[0];
    const variant = scene?.variants[0];
    expect(scene && variant).toBeTruthy();
    if (!scene || !variant) return;

    const changed = updateVariantText(
      document,
      scene.id,
      variant.id,
      'Новый текст',
      new SequenceClock(),
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.scenes[0]?.variants[0]?.text).toBe('Новый текст');
    expect(document.scenes[0]?.variants[0]?.text).toBe('');
  });

  it('supports the editor lifecycle without breaking invariants', () => {
    const ids = new SequenceIds();
    const clock = new SequenceClock();
    let document = createDocument('Роман', { ids, clock });

    const withSecondScene = addScene(document, { ids, clock });
    expect(withSecondScene.ok).toBe(true);
    if (!withSecondScene.ok) return;
    document = withSecondScene.value;

    const secondScene = document.scenes[1];
    expect(secondScene).toBeTruthy();
    if (!secondScene) return;

    const renamed = renameScene(document, secondScene.id, '', clock);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    document = renamed.value;

    const withVariant = addVariant(document, secondScene.id, { ids, clock });
    expect(withVariant.ok).toBe(true);
    if (!withVariant.ok) return;
    document = withVariant.value;

    const currentScene = document.scenes.find((scene) => scene.id === secondScene.id);
    const firstVariant = currentScene?.variants[0];
    const activeVariant = currentScene?.variants[1];
    expect(firstVariant && activeVariant).toBeTruthy();
    if (!firstVariant || !activeVariant) return;

    const activated = activateVariant(document, secondScene.id, firstVariant.id, clock);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    document = activated.value;

    const deletedVariant = deleteVariant(
      document,
      secondScene.id,
      firstVariant.id,
      clock,
    );
    expect(deletedVariant.ok).toBe(true);
    if (!deletedVariant.ok) return;
    document = deletedVariant.value;
    expect(document.scenes[1]?.activeVariantId).toBe(activeVariant.id);

    const moved = moveScene(document, secondScene.id, 0, clock);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    document = moved.value;
    expect(document.scenes[0]?.id).toBe(secondScene.id);
    expect(validateDocument(document).valid).toBe(true);
  });

  it('refuses to delete the last scene or last variant', () => {
    const document = createDocument('Роман', {
      ids: new SequenceIds(),
      clock: new SequenceClock(),
    });
    const scene = document.scenes[0];
    const variant = scene?.variants[0];
    expect(scene && variant).toBeTruthy();
    if (!scene || !variant) return;

    expect(deleteScene(document, scene.id)).toMatchObject({
      ok: false,
      error: { code: 'last-scene' },
    });
    expect(deleteVariant(document, scene.id, variant.id)).toMatchObject({
      ok: false,
      error: { code: 'last-variant' },
    });
  });
});
