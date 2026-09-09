// HTML → TXT: порт HTMLToTextParser из aio_v2.py на собственном токенизаторе,
// чтобы результат был одинаковым в браузере и в тестах.
//
// Отличия от Python-версии — намеренные исправления:
//  * void-теги (meta, link, br, img…) не открывают «пропускаемое поддерево»;
//  * элемент с игнорируемым классом пропускается целиком вместе с вложенными тегами.

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'blockquote',
  'li',
  'ul',
  'ol',
  'table',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'article',
  'section',
  'header',
  'footer',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'meta', 'link', 'title']);
const IGNORE_CLASSES = new Set([
  'chapter-publish-date',
  'publish-date',
  'date',
  'timestamp',
  'meta',
  'metadata',
]);
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  hellip: '…',
};

const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type Token =
  | { type: 'text'; text: string; raw?: boolean }
  | {
      type: 'start';
      tag: string;
      attrs: [string, string | null][];
      selfClosing: boolean;
    }
  | { type: 'end'; tag: string };

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][-.a-zA-Z0-9]*);?/g,
    (_whole, body: string) => {
      if (body.startsWith('#')) {
        const hex = body[1] === 'x' || body[1] === 'X';
        const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return `&${body};`;
        try {
          return String.fromCodePoint(code);
        } catch {
          return `&${body};`;
        }
      }
      return body in ENTITY_MAP ? (ENTITY_MAP[body] ?? '') : `&${body};`;
    },
  );
}

function parseAttrs(source: string): [string, string | null][] {
  const attrs: [string, string | null][] = [];
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(source)) !== null) {
    if (match[0] === '/' || match[0] === '' || !match[1]) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? null;
    attrs.push([match[1].toLowerCase(), value]);
  }
  return attrs;
}

function ignoredByClass(attrs: [string, string | null][]): boolean {
  return attrs.some(
    ([name, value]) =>
      name === 'class' &&
      Boolean(value) &&
      value!.split(/\s+/).some((cls) => IGNORE_CLASSES.has(cls)),
  );
}

function* tokenize(html: string): Generator<Token> {
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      yield { type: 'text', text: html.slice(i) };
      break;
    }
    if (lt > i) yield { type: 'text', text: html.slice(i, lt) };
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (html.startsWith('<![CDATA[', lt)) {
      const close = html.indexOf(']]>', lt + 9);
      yield {
        type: 'text',
        text: html.slice(lt + 9, close < 0 ? n : close),
        raw: true,
      };
      i = close < 0 ? n : close + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const close = html.indexOf('>', lt + 2);
      i = close < 0 ? n : close + 1;
      continue;
    }
    const endTag = /^<\/([a-zA-Z][^\s>/]*)\s*>/.exec(html.slice(lt, lt + 200));
    if (endTag && endTag[1]) {
      yield { type: 'end', tag: endTag[1].toLowerCase() };
      i = lt + endTag[0].length;
      continue;
    }
    const startTag = /^<([a-zA-Z][^\s>/]*)([^>]*)>/.exec(html.slice(lt));
    if (!startTag || !startTag[1]) {
      yield { type: 'text', text: '<' };
      i = lt + 1;
      continue;
    }
    const tag = startTag[1].toLowerCase();
    const rest = startTag[2] ?? '';
    const selfClosing = /\/\s*$/.test(rest);
    yield {
      type: 'start',
      tag,
      attrs: parseAttrs(selfClosing ? rest.replace(/\/\s*$/, '') : rest),
      selfClosing,
    };
    i = lt + startTag[0].length;
    if (RAW_TEXT_TAGS.has(tag) && !selfClosing) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const found = closeRe.exec(html.slice(i));
      const close = found ? i + found.index : n;
      yield { type: 'text', text: html.slice(i, close), raw: true };
      i = close;
    }
  }
}

export function htmlToText(html: string): string {
  const blocks: ({ kind: 'heading' | 'text'; text: string } | { kind: 'blank' })[] = [];
  let current: string[] = [];
  let inHeading = false;
  const skipStack: string[] = [];
  const openTags: string[] = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.join('');
    const lines: string[] = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/[ \t]+/g, ' ').trim();
      if (line) lines.push(line);
    }
    if (lines.length)
      blocks.push({ kind: inHeading ? 'heading' : 'text', text: lines.join('\n') });
    current = [];
  };

  for (const token of tokenize(html)) {
    if (token.type === 'text') {
      if (skipStack.length === 0)
        current.push(token.raw ? token.text : decodeEntities(token.text));
      continue;
    }
    if (token.type === 'start') {
      const { tag, attrs, selfClosing } = token;
      const isVoid = VOID_TAGS.has(tag) || selfClosing;
      if (skipStack.length > 0) {
        if (!isVoid) skipStack.push(tag);
        continue;
      }
      if (ignoredByClass(attrs) || SKIP_TAGS.has(tag)) {
        if (!isVoid) skipStack.push(tag);
        continue;
      }
      if (tag === 'br') {
        current.push('\n');
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        flush();
        if (HEADING_TAGS.has(tag)) inHeading = true;
      }
      if (!isVoid) openTags.push(tag);
      continue;
    }
    const { tag } = token;
    if (skipStack.length > 0) {
      const idx = skipStack.lastIndexOf(tag);
      if (idx >= 0) skipStack.length = idx;
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      if (current.join('').trim()) flush();
      else if (blocks.length && blocks[blocks.length - 1]?.kind !== 'blank')
        blocks.push({ kind: 'blank' });
      if (HEADING_TAGS.has(tag)) inHeading = false;
    }
    const idx = openTags.lastIndexOf(tag);
    if (idx >= 0) openTags.length = idx;
  }
  flush();

  const lines: string[] = [];
  let prevBlank = false;
  for (const block of blocks) {
    if (block.kind === 'blank') {
      if (lines.length && !prevBlank) {
        lines.push('');
        prevBlank = true;
      }
      continue;
    }
    if (block.kind === 'heading') {
      lines.push(`=== ${block.text} ===`);
      lines.push('');
      prevBlank = true;
    } else {
      lines.push(block.text);
      prevBlank = false;
    }
  }
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** Очистка уже текстового файла (clean_text_legacy): серии пустых строк схлопываются. */
export function cleanTextLegacy(content: string): string {
  const lines = content.split(/\r?\n|\r/);
  const cleaned: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').replace(/\s+$/, '');
    if (line.trim()) {
      cleaned.push(line);
      i += 1;
      continue;
    }
    let j = i;
    while (j < lines.length && !(lines[j] ?? '').trim()) j += 1;
    if (j - i >= 2) cleaned.push('');
    i = j;
  }
  return cleaned.join('\n');
}

export function cleanBasenameFor(name: string): string {
  return /\.html?$/i.test(name) ? name.replace(/\.html?$/i, '.txt') : name;
}
