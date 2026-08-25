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

  const paneHeaderHeights = await page
    .getByTestId('pane-header')
    .evaluateAll((headers) =>
      headers.map((header) => header.getBoundingClientRect().height),
    );
  expect(paneHeaderHeights).toHaveLength(2);
  expect(paneHeaderHeights[0]).toBe(paneHeaderHeights[1]);
});

test('compares two drafts and restores both inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
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

  const main = await page.locator('#main-content').boundingBox();
  const workspace = await page.getByTestId('diff-workspace').boundingBox();
  expect(main).not.toBeNull();
  expect(workspace).not.toBeNull();
  if (main && workspace) {
    expect(workspace.width / main.width).toBeGreaterThan(0.99);
  }
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

  const paneHeaderHeights = await page
    .getByTestId('pane-header')
    .evaluateAll((headers) =>
      headers.map((header) => header.getBoundingClientRect().height),
    );
  expect(paneHeaderHeights).toHaveLength(2);
  expect(paneHeaderHeights[0]).toBe(paneHeaderHeights[1]);

  await page.waitForTimeout(650);
  await page.reload();
  await expect(source).toHaveValue('<script>alert("x")</script>\nФраза с «акцентом».');
});

test('highlights writer artifacts, searches the text and keeps the audit draft', async ({
  page,
}) => {
  await page.goto('audit');
  const source = page.getByLabel('Текст для аудита');
  // Во втором «кoшка» латинская o, между словами двойной пробел.
  await source.fill('кошка и кoшка  ждали');

  await expect(page.locator('[data-layer="mixedScript"]')).toHaveText('кoшка');
  await expect(page.locator('[data-layer="extraSpace"]')).toHaveCount(1);

  await page.getByRole('button', { name: /Латиница/ }).click();
  await expect(page.locator('[data-layer="latin"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Смешанные буквы/ }).click();
  await expect(page.locator('[data-layer="latin"]')).toHaveText('o');

  await page.getByLabel('Поиск').fill('ждали');
  await expect(page.locator('[data-layer="search"]')).toHaveText('ждали');
  await expect(page.getByTestId('audit-match-count')).toHaveText('1 из 1');

  await expect(source).toHaveJSProperty('spellcheck', false);
  await page.getByLabel('Проверка орфографии').check();
  await expect(source).toHaveJSProperty('spellcheck', true);

  await page.waitForTimeout(650);
  await page.reload();
  await expect(source).toHaveValue('кошка и кoшка  ждали');
  await expect(source).toHaveJSProperty('spellcheck', true);
});

test('keeps the highlight overlay aligned with the textarea it covers', async ({
  page,
}) => {
  await page.goto('audit');
  const source = page.getByLabel('Текст для аудита');
  await source.fill(
    Array.from(
      { length: 40 },
      (_, index) => `Строка ${index} ${'слово '.repeat(14)}`,
    ).join('\n'),
  );

  const metrics = await page.evaluate(() => {
    const textarea = document.querySelector('#audit-source');
    const backdrop = document.querySelector('[data-testid="audit-backdrop"]');
    if (
      !(textarea instanceof HTMLTextAreaElement) ||
      !(backdrop instanceof HTMLElement)
    ) {
      throw new Error('audit editor is not rendered');
    }
    textarea.scrollTop = 120;
    textarea.dispatchEvent(new Event('scroll'));
    return {
      textareaHeight: textarea.scrollHeight,
      backdropHeight: backdrop.scrollHeight,
      textareaWidth: textarea.clientWidth,
      backdropWidth: backdrop.clientWidth,
    };
  });

  expect(metrics.backdropWidth).toBe(metrics.textareaWidth);
  expect(Math.abs(metrics.backdropHeight - metrics.textareaHeight)).toBeLessThanOrEqual(
    1,
  );
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const backdrop = document.querySelector('[data-testid="audit-backdrop"]');
        return backdrop instanceof HTMLElement ? backdrop.scrollTop : -1;
      }),
    )
    .toBe(120);
});
