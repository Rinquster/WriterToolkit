import { expect, test } from '@playwright/test';

const HTML_1 =
  '<h2 class="chapter-title">Глава 1</h2><div class="chapter-publish-date">01.01.2025</div>' +
  '<p>Он шёл — и думал. Это был не сон, это явь.</p><p><br></p><p>Не свет, а тьма. Будто тень.</p>';
const HTML_2 =
  '<h2 class="chapter-title">Глава 2</h2><p>Тихо. Будто-будто. Ночь — длинная.</p><p>Просто текст без тире.</p>';

test('converts chapters, counts presets, adds a quick regex and opens the viewer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('analyzer');
  const tabs = page.getByTestId('analyzer-tabs');
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  await expect(tabs.getByRole('tab').first()).toHaveText('Символы');

  // импорт двух HTML через скрытый input и преобразование
  await page.getByRole('button', { name: 'Загрузить в HTML' }).click();
  await page.getByTestId('analyzer-upload').setInputFiles([
    { name: '01.html', mimeType: 'text/html', buffer: Buffer.from(HTML_1) },
    { name: '02.html', mimeType: 'text/html', buffer: Buffer.from(HTML_2) },
  ]);
  await expect(page.getByTestId('list-html').getByRole('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Преобразовать все HTML в TXT' }).click();
  await expect(page.getByTestId('list-txt').getByRole('option')).toHaveCount(2);

  // таблица «Символы»: значения, производный столбец и полоска с масштабом
  const table = page.getByTestId('analyzer-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first().locator('td').nth(1)).not.toHaveText(
    '…',
  );
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(page.getByTestId('scale-note')).toContainText('деление');
  await expect(table.locator('tbody tr').first().locator('td').nth(1)).toHaveText(/\d/);

  // шаблоны: тире, не…а…, это не…
  const valueOf = async (tabName: string, row: number) => {
    await tabs.getByRole('tab', { name: tabName }).click();
    const cell = table.locator('tbody tr').nth(row).locator('td').nth(1);
    await expect(cell).not.toHaveText('…');
    return cell.getAttribute('data-copy');
  };
  expect(await valueOf('Тире', 0)).toBe('1');
  expect(await valueOf('Тире', 1)).toBe('1');
  expect(await valueOf('не…, а…', 0)).toBe('1');
  expect(await valueOf('это не…, это…', 0)).toBe('1');

  // быстрое добавление регулярки
  await page.getByLabel('Быстро добавить инструкцию-регулярку').fill('будто');
  await page.getByLabel('Быстро добавить инструкцию-регулярку').press('Enter');
  await expect(tabs.getByRole('tab')).toHaveCount(5);
  await expect(table.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveAttribute(
    'data-copy',
    '2',
  );

  // находки и просмотр текста с подсветкой и линейкой
  await table.locator('tbody tr').nth(1).locator('td').first().dblclick();
  const viewer = page.getByTestId('analyzer-viewer');
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId('viewer-count')).toHaveText('1 из 2');
  await expect(viewer.locator('mark')).toHaveCount(2);
  await page.getByRole('button', { name: 'Следующая находка' }).click();
  await expect(page.getByTestId('viewer-count')).toHaveText('2 из 2');
  await page.screenshot({ path: 'test-results/analyzer-viewer.png' });
  await page.getByRole('button', { name: 'К таблице' }).click();
  await expect(table).toBeVisible();

  // одиночный клик по имени — панель находок; двойной её не открывает раньше времени
  await table.locator('tbody tr').nth(0).locator('td').first().click();
  const inspector = page.getByTestId('analyzer-inspector');
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId('hits-list').locator('button')).toHaveCount(1);

  // ошибка регулярки подсвечивает вкладку
  await inspector.getByRole('tab', { name: 'Инструкция' }).click();
  await page.getByLabel('Режим запроса').selectOption('regex');
  await page.locator('#analyzer-query').fill('(');
  await expect(page.getByTestId('query-error')).toContainText('регулярка');

  // перезагрузка: файлы и инструкции на месте
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('list-txt').getByRole('option')).toHaveCount(2);
  await expect(page.getByTestId('analyzer-tabs').getByRole('tab')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/analyzer.png', fullPage: false });
});
