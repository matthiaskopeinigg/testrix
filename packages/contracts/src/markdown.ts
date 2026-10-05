export type MarkdownInline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }
  | { readonly kind: 'strike'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly inlines: readonly MarkdownInline[] }
  | { readonly kind: 'paragraph'; readonly inlines: readonly MarkdownInline[] }
  | { readonly kind: 'code'; readonly text: string; readonly language: string }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly MarkdownInline[])[] }
  | { readonly kind: 'blockquote'; readonly inlines: readonly MarkdownInline[] }
  | { readonly kind: 'hr' }
  | {
      readonly kind: 'table';
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

const SAFE_HREF = /^(https?:|mailto:)/i;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

function unescapeText(value: string): string {
  return value.replace(/\\([\\`*_[\]()~])/g, '$1');
}

function parseInlines(input: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let rest = input;
  while (rest.length > 0) {
    const match = rest.match(
      /`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/,
    );
    if (!match || match.index === undefined) {
      out.push({ kind: 'text', text: unescapeText(rest) });
      break;
    }
    if (match.index > 0)
      out.push({ kind: 'text', text: unescapeText(rest.slice(0, match.index)) });
    if (match[1] !== undefined)
      out.push({ kind: 'code', text: match[1] });
    else if (match[2] !== undefined)
      out.push({ kind: 'strong', text: unescapeText(match[2]) });
    else if (match[3] !== undefined)
      out.push({ kind: 'strike', text: unescapeText(match[3]) });
    else if (match[4] !== undefined)
      out.push({ kind: 'em', text: unescapeText(match[4]) });
    else {
      const href = (match[6] ?? '').trim();
      out.push({
        kind: 'link',
        text: unescapeText(match[5] ?? ''),
        href: SAFE_HREF.test(href) ? href : '',
      });
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return out.filter((part) => part.kind !== 'text' || part.text.length > 0);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|');
}

function startsBlock(line: string): boolean {
  return (
    line.startsWith('```') ||
    /^(#{1,3})\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    HR.test(line) ||
    isTableLine(line)
  );
}

/**
 * Tokenizes a markdown subset for Angular rendering. Does not produce HTML.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([A-Za-z0-9_+-]*)\s*$/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length)
        index += 1;
      blocks.push({ kind: 'code', text: body.join('\n'), language: fence[1] ?? '' });
      continue;
    }

    if (HR.test(line) && !isTableLine(line)) {
      blocks.push({ kind: 'hr' });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inlines: parseInlines(heading[2]) });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'blockquote', inlines: parseInlines(quote.join(' ')) });
      continue;
    }

    if (isTableLine(line) && index + 1 < lines.length && TABLE_SEP.test(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableLine(lines[index]) && !TABLE_SEP.test(lines[index])) {
        const cells = splitTableRow(lines[index]);
        while (cells.length < headers.length)
          cells.push('');
        rows.push(cells.slice(0, headers.length));
        index += 1;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: MarkdownInline[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
        if (!item)
          break;
        items.push(parseInlines(item[1]));
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !startsBlock(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', inlines: parseInlines(paragraph.join(' ')) });
  }

  return blocks;
}
