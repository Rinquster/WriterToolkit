export type ParagraphMode = 'lines' | 'paragraphs';

export interface TextToHtmlOptions {
  paragraphMode: ParagraphMode;
  emphasizeGuillemets: boolean;
  preserveBlankLines: boolean;
}

export function textToHtml(source: string, options: TextToHtmlOptions): string {
  if (source === '') return '';
  const normalized = source.replace(/\r\n?/g, '\n');

  if (options.paragraphMode === 'lines') {
    return normalized
      .split('\n')
      .filter((line) => options.preserveBlankLines || line.length > 0)
      .map((line) =>
        line.length === 0 ? '<p><br></p>' : `<p>${formatInline(line, options)}</p>`,
      )
      .join('\n');
  }

  const paragraphs = normalized.split(/\n{2,}/);
  return paragraphs
    .filter((paragraph) => options.preserveBlankLines || paragraph.length > 0)
    .map((paragraph) => {
      if (paragraph.length === 0) return '<p><br></p>';
      return `<p>${formatInline(paragraph, options).replaceAll('\n', '<br>\n')}</p>`;
    })
    .join('\n');
}

export function completeHtmlDocument(
  fragment: string,
  title = 'WriterToolkit export',
): string {
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    fragment,
    '</body>',
    '</html>',
  ].join('\n');
}

function formatInline(value: string, options: TextToHtmlOptions): string {
  if (!options.emphasizeGuillemets) return escapeHtml(value);

  let result = '';
  let cursor = 0;
  const pairs = value.matchAll(/«[\s\S]*?»/g);
  for (const match of pairs) {
    const index = match.index;
    const text = match[0];
    result += escapeHtml(value.slice(cursor, index));
    result += `<em>${escapeHtml(text)}</em>`;
    cursor = index + text.length;
  }
  return result + escapeHtml(value.slice(cursor));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
