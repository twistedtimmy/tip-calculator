import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Inline } from '../model.js';
import { normalizeInlines } from '../model.js';
import type { RawBlock, RawResult } from './raw.js';

interface Fmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const INLINE_TAGS: Record<string, keyof Fmt> = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline' };

/**
 * Collect the text of a node as lines of inlines. A <br> starts a new line;
 * everything else just contributes formatted text.
 */
function collectLines(node: AnyNode, fmt: Fmt, lines: Inline[][]): void {
  if (node.type === 'text') {
    const text = node.data.replace(/[\s ]+/g, ' ');
    if (text) lines[lines.length - 1]!.push({ text, ...fmt });
    return;
  }
  if (node.type !== 'tag') return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') {
    lines.push([]);
    return;
  }
  if (tag === 'img' || tag === 'script' || tag === 'style') return;
  const key = INLINE_TAGS[tag];
  const next: Fmt = key ? { ...fmt, [key]: true } : fmt;
  for (const child of el.children) collectLines(child, next, lines);
}

function trimLine(line: Inline[]): Inline[] {
  const merged = normalizeInlines(line);
  if (merged.length === 0) return merged;
  merged[0]!.text = merged[0]!.text.replace(/^\s+/, '');
  const last = merged[merged.length - 1]!;
  last.text = last.text.replace(/\s+$/, '');
  return normalizeInlines(merged);
}

function linesOf(el: Element): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const child of el.children) collectLines(child, {}, lines);
  return lines.map(trimLine).filter((line) => line.some((inline) => inline.text.trim() !== ''));
}

function joined(el: Element): Inline[] {
  const lines = linesOf(el);
  const out: Inline[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ text: ' ' });
    out.push(...line);
  });
  return normalizeInlines(out);
}

/** Convert the HTML produced by mammoth or marked into raw blocks. */
export function htmlToBlocks(html: string): RawResult {
  const $ = cheerio.load(html);
  const blocks: RawBlock[] = [];
  const warnings = new Set<string>();

  const visit = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    const classes = (el.attribs['class'] ?? '').split(/\s+/);

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(5, Number(tag.slice(1)));
      const inlines = joined(el);
      if (inlines.length) blocks.push({ kind: classes.includes('title') ? 'title' : 'heading', level, inlines, explicit: true });
      return;
    }
    if (tag === 'p' || tag === 'pre') {
      const kind: RawBlock['kind'] = classes.includes('reference') ? 'reference' : 'paragraph';
      for (const line of linesOf(el)) blocks.push({ kind, inlines: line });
      return;
    }
    if (tag === 'blockquote') {
      const paragraphs: Inline[][] = [];
      const children = el.children.filter((c): c is Element => c.type === 'tag');
      if (children.some((c) => c.tagName.toLowerCase() === 'p')) {
        for (const child of children) {
          if (child.tagName.toLowerCase() === 'p') paragraphs.push(...linesOf(child));
        }
      } else {
        paragraphs.push(...linesOf(el));
      }
      if (paragraphs.length) blocks.push({ kind: 'blockquote', inlines: [], paragraphs, explicit: true });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      warnings.add('Lists were converted to plain paragraphs. APA papers rarely use bullet lists; rewrite them as prose if your instructor expects it.');
      for (const li of el.children) {
        if (li.type === 'tag' && (li as Element).tagName.toLowerCase() === 'li') {
          const inlines = joined(li as Element);
          if (inlines.length) blocks.push({ kind: 'paragraph', inlines });
        }
      }
      return;
    }
    if (tag === 'table') {
      warnings.add('A table was skipped. APA tables need their own numbering, title and notes, so add them back by hand in Word.');
      return;
    }
    if (tag === 'hr' || tag === 'img' || tag === 'script' || tag === 'style') return;
    if (['div', 'section', 'article', 'main', 'header', 'footer', 'body'].includes(tag)) {
      // Loose text directly inside a container becomes a paragraph of its own.
      const loose: Inline[][] = [[]];
      for (const child of el.children) {
        if (child.type === 'tag') {
          const current = trimLine(loose[loose.length - 1]!);
          if (current.length) blocks.push({ kind: 'paragraph', inlines: current });
          loose.splice(0, loose.length, []);
          visit(child as Element);
        } else {
          collectLines(child, {}, loose);
        }
      }
      const current = trimLine(loose[loose.length - 1]!);
      if (current.length) blocks.push({ kind: 'paragraph', inlines: current });
      return;
    }
    const inlines = joined(el);
    if (inlines.length) blocks.push({ kind: 'paragraph', inlines });
  };

  const body = $('body').get(0);
  if (body) visit(body);
  return { blocks, warnings: [...warnings] };
}
