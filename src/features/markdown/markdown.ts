import DOMPurify from 'dompurify';
import { Marked } from 'marked';

export function renderMarkdown(source: string, breaks = false): string {
  const parser = new Marked({ gfm: true, breaks, async: false });
  const rawHtml = parser.parse(source) as string;
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  });
}
