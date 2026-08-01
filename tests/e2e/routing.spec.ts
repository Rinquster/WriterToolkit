import { expect, test } from '@playwright/test';

const routes = [
  { path: 'scenes', heading: 'Документы сцен' },
  { path: 'diff', heading: 'Сравнение текстов' },
  { path: 'markdown', heading: 'Markdown' },
  { path: 'html', heading: 'Text → HTML' },
  { path: 'about', heading: 'О WriterToolkit' },
] as const;

for (const route of routes) {
  test(`opens /${route.path} directly through the Pages fallback`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(
      page.getByRole('navigation', { name: 'Основная навигация' }),
    ).toBeVisible();
  });
}

test('renders the application Not Found page for an unknown route', async ({
  page,
}) => {
  await page.goto('missing-route');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Страница не найдена',
  );
});

test('opens and closes the navigation drawer on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('scenes');

  const menuButton = page.getByRole('button', { name: 'Открыть меню' });
  await menuButton.click();
  await expect(
    page.getByRole('button', { name: 'Закрыть меню' }).first(),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
});
