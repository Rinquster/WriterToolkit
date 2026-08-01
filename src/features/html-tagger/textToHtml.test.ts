import { describe, expect, it } from 'vitest';
import { completeHtmlDocument, textToHtml, type TextToHtmlOptions } from './textToHtml';

const baseOptions: TextToHtmlOptions = {
  paragraphMode: 'lines',
  emphasizeGuillemets: true,
  preserveBlankLines: true,
};

describe('textToHtml', () => {
  it('escapes source markup before emitting the controlled tags', () => {
    const result = textToHtml('<script>alert("x")</script> & текст', baseOptions);
    expect(result).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; текст</p>',
    );
    expect(result).not.toContain('<script>');
  });

  it('wraps balanced guillemet spans in emphasis and leaves unmatched quotes alone', () => {
    expect(textToHtml('Он сказал: «да», затем «нет».', baseOptions)).toBe(
      '<p>Он сказал: <em>«да»</em>, затем <em>«нет»</em>.</p>',
    );
    expect(textToHtml('Он сказал: «возможно.', baseOptions)).toBe(
      '<p>Он сказал: «возможно.</p>',
    );
  });

  it('supports line and paragraph grouping without mutating source whitespace', () => {
    expect(textToHtml('Первая\r\n\r\nВторая', baseOptions)).toBe(
      '<p>Первая</p>\n<p><br></p>\n<p>Вторая</p>',
    );
    expect(
      textToHtml('Первая строка\nвторая\n\nНовый абзац', {
        ...baseOptions,
        paragraphMode: 'paragraphs',
      }),
    ).toBe('<p>Первая строка<br>\nвторая</p>\n<p>Новый абзац</p>');
  });

  it('builds a standalone UTF-8 HTML document with an escaped title', () => {
    const document = completeHtmlDocument('<p>Текст</p>', 'Глава <1>');
    expect(document).toContain('<meta charset="utf-8">');
    expect(document).toContain('<title>Глава &lt;1&gt;</title>');
    expect(document).toContain('<body>\n<p>Текст</p>\n</body>');
  });
});
