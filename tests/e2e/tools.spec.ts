import { expect, test } from '@playwright/test';

test('renders and restores a sanitized Markdown draft with correct lists', async ({
  page,
}) => {
  await page.goto('markdown');
  const source = page.getByLabel('Markdown-исходник');
  await source.fill(
    [
      '# Проверка',
      '',
      '1. Первый',
      '2. Второй',
      '   - Вложенный',
      '',
      '- [x] Готово',
      '',
      '<img src="x" onerror="window.pwned=true"><script>window.pwned=true</script>',
    ].join('\n'),
  );

  const preview = page.locator('[id="markdown-preview-title"]');
  await expect(preview.getByRole('heading', { name: 'Проверка' })).toBeVisible();
  await expect(preview.locator('ol > li')).toHaveCount(2);
  await expect(preview.locator('ol ul > li')).toHaveCount(1);
  await expect(preview.locator('input[type="checkbox"]')).toBeDisabled();
  await expect(preview.locator('script')).toHaveCount(0);
  await expect(preview.locator('[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);

  await page.waitForTimeout(650);
  await page.reload();
  await expect(source).toHaveValue(/1\. Первый/);
});

test('compares two drafts and restores both inputs', async ({ page }) => {
  await page.goto('diff');
  const before = page.locator('#diff-before');
  const after = page.locator('#diff-after');
  await before.fill('Он  пришёл.\nВечер был тихим.');
  await after.fill('Он ушёл.\nВечер был очень тихим.');

  await expect(page.getByRole('heading', { name: 'Найдены различия' })).toBeVisible();
  await expect(page.locator('[data-change="removed"]').first()).toBeVisible();
  await expect(page.locator('[data-change="added"]').first()).toBeVisible();

  await page.waitForTimeout(650);
  await page.reload();
  await expect(before).toHaveValue('Он  пришёл.\nВечер был тихим.');
  await expect(after).toHaveValue('Он ушёл.\nВечер был очень тихим.');
});

test('escapes source markup in Text to HTML and keeps the local draft', async ({
  page,
}) => {
  await page.goto('html');
  const source = page.getByLabel('Исходный текст');
  await source.fill('<script>alert("x")</script>\nФраза с «акцентом».');

  const output = page.locator('#html-result-title');
  await expect(output).toHaveValue(/&lt;script&gt;/);
  await expect(output).toHaveValue(/<em>«акцентом»<\/em>/);
  await page.getByRole('tab', { name: 'Превью' }).click();
  await expect(page.locator('#html-result-title em')).toHaveText('«акцентом»');
  await expect(page.locator('#html-result-title script')).toHaveCount(0);

  await page.waitForTimeout(650);
  await page.reload();
  await expect(source).toHaveValue('<script>alert("x")</script>\nФраза с «акцентом».');
});
