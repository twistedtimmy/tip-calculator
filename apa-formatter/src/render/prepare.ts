/**
 * Resolves everything the renderers share, so the HTML, DOCX and PDF outputs
 * can't drift apart: the final title, running head, title-page lines, run-in
 * headings (levels 4–5) and the ordered reference list.
 */
import type { Inline, Paper } from '../model.js';
import { FONTS, inlineText, normalizeInlines } from '../model.js';
import { makeRunningHead, titleCaseText, toTitleCase } from '../apa/text.js';

export type PreparedItem =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; runIn?: { level: 4 | 5; text: string }; inlines: Inline[] }
  | { kind: 'blockquote'; paragraphs: Inline[][] };

export interface Prepared {
  title: string;
  runningHead: string | null;
  font: (typeof FONTS)[keyof typeof FONTS];
  paperType: Paper['options']['paperType'];
  titleLines: string[];
  authorNote: string;
  abstract: string | null;
  keywords: string;
  body: PreparedItem[];
  references: Inline[][];
}

function titleCaseInlines(inlines: Inline[]): Inline[] {
  const merged = normalizeInlines(inlines);
  const joined = inlineText(merged);
  const cased = titleCaseText(joined);
  // Casing keeps the length, so the cased text slices back into the original runs with their spaces intact.
  if (cased.length !== joined.length) return merged.map((inline) => ({ ...inline, text: titleCaseText(inline.text) }));
  let offset = 0;
  return merged.map((inline) => {
    const text = cased.slice(offset, offset + inline.text.length);
    offset += inline.text.length;
    return { ...inline, text };
  });
}

function sortKey(inlines: Inline[]): string {
  return inlineText(inlines)
    .trim()
    .toLowerCase()
    .replace(/^[“"'‘(\[]+/, '')
    .replace(/^(a|an|the)\s+/, '');
}

export function preparePaper(paper: Paper): Prepared {
  const { meta, options } = paper;
  const fix = options.fixHeadingCase;
  const rawTitle = meta.title.trim() || 'Untitled Paper';
  const title = fix ? toTitleCase(rawTitle) : rawTitle;

  const wantsHead = options.includeRunningHead || options.paperType === 'professional';
  const runningHead = wantsHead ? makeRunningHead(options.runningHead.trim() || title) : null;

  const student = options.paperType === 'student';
  const titleLines = (student ? [meta.authors, meta.affiliation, meta.course, meta.instructor, meta.dueDate] : [meta.authors, meta.affiliation])
    .map((line) => line.trim())
    .filter(Boolean);

  const body: PreparedItem[] = [];
  const references: Inline[][] = [];
  const blocks = paper.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type === 'reference') {
      references.push(block.inlines);
    } else if (block.type === 'paragraph') {
      body.push({ kind: 'paragraph', inlines: block.inlines });
    } else if (block.type === 'blockquote') {
      body.push({ kind: 'blockquote', paragraphs: block.paragraphs });
    } else {
      const inlines = fix ? titleCaseInlines(block.inlines) : block.inlines;
      if (block.level <= 3) {
        body.push({ kind: 'heading', level: block.level as 1 | 2 | 3, inlines });
      } else {
        // Levels 4 and 5 end with a period and run into the paragraph that follows (§2.27).
        const headingText = inlineText(inlines).trim().replace(/[.:]+$/, '') + '.';
        const next = blocks[i + 1];
        if (next?.type === 'paragraph') {
          body.push({ kind: 'paragraph', runIn: { level: block.level as 4 | 5, text: headingText }, inlines: next.inlines });
          i++;
        } else {
          body.push({ kind: 'paragraph', runIn: { level: block.level as 4 | 5, text: headingText }, inlines: [] });
        }
      }
    }
  }

  if (options.alphabetizeReferences) {
    references.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'en', { sensitivity: 'base' }));
  }

  return {
    title,
    runningHead,
    font: FONTS[options.font],
    paperType: options.paperType,
    titleLines,
    authorNote: options.paperType === 'professional' ? meta.authorNote.trim() : '',
    abstract: options.includeAbstract && options.abstract.trim() ? options.abstract.trim() : null,
    keywords: options.keywords.trim(),
    body,
    references,
  };
}
