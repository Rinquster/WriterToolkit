import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders ordered, unordered, nested and task lists with GFM semantics', () => {
    const html = renderMarkdown(
      [
        '1. Первый',
        '2. Второй',
        '   - Вложенный',
        '',
        '- [x] Готово',
        '- [ ] Позже',
      ].join('\n'),
    );
    const document = new DOMParser().parseFromString(html, 'text/html');

    expect(document.querySelectorAll('ol > li')).toHaveLength(2);
    expect(document.querySelectorAll('ol ul > li')).toHaveLength(1);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(
      document.querySelector('input[type="checkbox"]')?.hasAttribute('disabled'),
    ).toBe(true);
  });

  it('sanitizes executable HTML and named DOM properties', () => {
    const html = renderMarkdown(
      '<script>window.pwned = true</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" id="location">x</a>',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('id="location"');
  });

  it('keeps CommonMark soft breaks unless the explicit breaks option is enabled', () => {
    expect(renderMarkdown('первая\nвторая')).not.toContain('<br>');
    expect(renderMarkdown('первая\nвторая', true)).toContain('<br>');
  });
});
