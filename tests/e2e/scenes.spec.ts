import { expect, test } from '@playwright/test';

const legacyFixture = [
  {
    id: 90,
    title: 'Финал',
    activeVariant: 20,
    variants: [
      { id: 10, text: 'Первый вариант финала' },
      { id: 20, text: 'Активный вариант финала\n\nСо вторым абзацем' },
    ],
  },
  {
    id: 90,
    title: 'Пролог',
    activeVariant: -1,
    variants: [{ id: -1, text: 'Текст пролога' }],
  },
];

test('creates, edits, autosaves and restores a scene document', async ({ page }) => {
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();
  await expect(page).toHaveURL(/\/WriterToolkit\/scenes\/[\w-]+$/);

  const documentName = page.getByLabel('Название документа');
  const sceneTitle = page.getByLabel('Название сцены 1');
  const textarea = page.getByLabel('Текст активного варианта сцены 1');
  await documentName.fill('Черновик главы');
  await sceneTitle.fill('Встреча');
  await textarea.fill('Первый вариант сцены');
  await page.getByRole('button', { name: 'Добавить вариант в сцену 1' }).click();
  await page
    .getByLabel('Текст активного варианта сцены 1')
    .fill('Второй вариант сцены');

  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  await page.reload();

  await expect(documentName).toHaveValue('Черновик главы');
  await expect(sceneTitle).toHaveValue('Встреча');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByLabel('Текст активного варианта сцены 1')).toHaveValue(
    'Второй вариант сцены',
  );
  await page.getByRole('tab', { name: '1' }).click();
  await expect(page.getByLabel('Текст активного варианта сцены 1')).toHaveValue(
    'Первый вариант сцены',
  );
});

test('imports and exports the legacy projection without changing content', async ({
  page,
}) => {
  await page.goto('scenes');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'legacy-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyFixture)),
  });

  await expect(
    page.getByRole('heading', { name: 'Импортировать «legacy-draft»?' }),
  ).toBeVisible();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText('3', { exact: true })).toBeVisible();
  await expect(page.getByText('ID сцены 90 повторяется')).toBeVisible();
  await page.getByRole('button', { name: 'Импортировать как новый' }).click();

  const cards = page.getByTestId('scene-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByLabel('Название сцены 1')).toHaveValue('Финал');
  await expect(cards.nth(0).getByRole('tab')).toHaveCount(2);
  await expect(cards.nth(0).getByLabel('Текст активного варианта сцены 1')).toHaveValue(
    legacyFixture[0]!.variants[1]!.text,
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(
    Buffer.concat(chunks).toString('utf8'),
  ) as typeof legacyFixture;

  expect(project(exported)).toEqual(project(legacyFixture));
});

test('reorders scenes through the keyboard drag-and-drop interaction and persists it', async ({
  page,
}) => {
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();
  await page.getByLabel('Название сцены 1').fill('Первая');
  await page.getByRole('button', { name: '+ Сцена' }).click();
  await page.getByLabel('Название сцены 2').fill('Вторая');

  const secondHandle = page.getByRole('button', { name: /Перетащить сцену 2/ });
  await secondHandle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');

  const titles = page.locator('[data-testid="scene-card"] input');
  await expect(titles.nth(0)).toHaveValue('Вторая');
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-testid="scene-card"] input').nth(0)).toHaveValue(
    'Вторая',
  );
});

test('reorders scenes by dragging the dedicated handle with a pointer', async ({
  page,
}) => {
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();
  await page.getByLabel('Название сцены 1').fill('Первая');
  await page.getByRole('button', { name: '+ Сцена' }).click();
  await page.getByLabel('Название сцены 2').fill('Вторая');

  const firstHandle = page.getByRole('button', { name: /Перетащить сцену 1/ });
  const secondCard = page.getByTestId('scene-card').nth(1);
  const source = await firstHandle.boundingBox();
  const target = await secondCard.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  if (!source || !target) return;

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, {
    steps: 14,
  });
  await page.mouse.up();

  await expect(page.locator('[data-testid="scene-card"] input').nth(0)).toHaveValue(
    'Вторая',
  );
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
});

test('undoes and redoes a grouped text edit', async ({ page }) => {
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();
  const textarea = page.getByLabel('Текст активного варианта сцены 1');
  await textarea.fill('Черновая реплика');

  await page.getByRole('button', { name: '↶ Отменить' }).click();
  await expect(textarea).toHaveValue('');
  await page.getByRole('button', { name: '↷ Вернуть' }).click();
  await expect(textarea).toHaveValue('Черновая реплика');
});

test('keeps search collapsed and lets it return focus to its header control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();

  await expect(page.getByRole('search')).toHaveCount(0);
  const openSearch = page.getByRole('button', { name: 'Открыть поиск' });
  await openSearch.click();

  const searchInput = page.getByLabel('Поиск по всем вариантам');
  await expect(searchInput).toBeFocused();
  await searchInput.fill('реплика');
  await searchInput.press('Escape');
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Открыть поиск' })).toBeFocused();

  await page.getByRole('button', { name: 'Открыть поиск' }).click();
  await expect(searchInput).toHaveValue('реплика');

  const main = await page.locator('#main-content').boundingBox();
  const sceneList = await page.getByTestId('scene-list').boundingBox();
  expect(main).not.toBeNull();
  expect(sceneList).not.toBeNull();
  if (main && sceneList) {
    expect(sceneList.width / main.width).toBeGreaterThan(0.9);
  }
});

test('archives a deleted document and restores it from recovery', async ({ page }) => {
  await page.goto('scenes');
  await page.getByRole('button', { name: 'Новый документ' }).click();
  await page.getByLabel('Название документа').fill('Восстанавливаемый черновик');
  await page
    .getByLabel('Текст активного варианта сцены 1')
    .fill('Текст не должен потеряться');
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Документы' }).click();

  await page
    .getByRole('button', { name: 'Удалить документ «Восстанавливаемый черновик»' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Удалить «Восстанавливаемый черновик»?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Недавно удалённые' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Восстанавливаемый черновик/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Восстановить' }).click();
  const restored = page.getByRole('link', { name: /Восстанавливаемый черновик/ });
  await expect(restored).toBeVisible();
  await restored.click();
  await expect(page.getByLabel('Текст активного варианта сцены 1')).toHaveValue(
    'Текст не должен потеряться',
  );
});

function project(input: typeof legacyFixture) {
  return input.map((scene) => ({
    title: scene.title,
    activeVariantIndex: scene.variants.findIndex(
      (variant) => variant.id === scene.activeVariant,
    ),
    variants: scene.variants.map((variant) => ({ text: variant.text })),
  }));
}
