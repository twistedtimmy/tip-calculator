/**
 * The document model everything renders from.
 *
 * A Paper is the student's content (blocks of inlines) plus the title-page
 * fields and formatting options. The parsers build it, the UI edits it, and the
 * HTML / DOCX / PDF renderers read it. Nothing is ever round-tripped through a
 * lossy format.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5;

export type Block =
  | { type: 'heading'; level: HeadingLevel; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'blockquote'; paragraphs: Inline[][] }
  | { type: 'reference'; inlines: Inline[] };

export interface TitlePage {
  title: string;
  authors: string;
  affiliation: string;
  course: string;
  instructor: string;
  dueDate: string;
  /** Professional papers only. */
  authorNote: string;
}

export type FontChoice = 'times' | 'calibri' | 'arial' | 'georgia';

export interface FormatOptions {
  paperType: 'student' | 'professional';
  font: FontChoice;
  /** APA 7 only requires a running head on professional papers; some instructors ask for it anyway. */
  includeRunningHead: boolean;
  /** Empty means "derive from the title". */
  runningHead: string;
  includeAbstract: boolean;
  abstract: string;
  keywords: string;
  alphabetizeReferences: boolean;
  fixHeadingCase: boolean;
}

export interface Paper {
  meta: TitlePage;
  options: FormatOptions;
  blocks: Block[];
  /** Things the parser wants the student to look at. Shown in the UI, never exported. */
  warnings: string[];
}

/** APA 7 accepts several fonts; each has a recommended size (§2.19). */
export const FONTS: Record<FontChoice, { name: string; sizePt: number; cssStack: string }> = {
  times: { name: 'Times New Roman', sizePt: 12, cssStack: '"Times New Roman", "Liberation Serif", Tinos, serif' },
  calibri: { name: 'Calibri', sizePt: 11, cssStack: 'Calibri, Carlito, "Liberation Sans", Arial, sans-serif' },
  arial: { name: 'Arial', sizePt: 11, cssStack: 'Arial, "Liberation Sans", Arimo, sans-serif' },
  georgia: { name: 'Georgia', sizePt: 11, cssStack: 'Georgia, Gelasio, "DejaVu Serif", serif' },
};

export function emptyMeta(): TitlePage {
  return { title: '', authors: '', affiliation: '', course: '', instructor: '', dueDate: '', authorNote: '' };
}

export function defaultOptions(): FormatOptions {
  return {
    paperType: 'student',
    font: 'times',
    includeRunningHead: false,
    runningHead: '',
    includeAbstract: false,
    abstract: '',
    keywords: '',
    alphabetizeReferences: true,
    fixHeadingCase: true,
  };
}

export function inlineText(inlines: Inline[]): string {
  return inlines.map((i) => i.text).join('');
}

export function blockText(block: Block): string {
  if (block.type === 'blockquote') return block.paragraphs.map(inlineText).join('\n');
  return inlineText(block.inlines);
}

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Merge neighbouring inlines that share formatting and drop empty ones. */
export function normalizeInlines(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    if (inline.text === '') continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!inline.bold && !!prev.italic === !!inline.italic && !!prev.underline === !!inline.underline) {
      prev.text += inline.text;
    } else {
      out.push({ text: inline.text, bold: inline.bold || undefined, italic: inline.italic || undefined, underline: inline.underline || undefined });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation of papers that come back from the browser.
// ---------------------------------------------------------------------------

const MAX_BLOCKS = 5000;
const MAX_TEXT = 200_000;

function str(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeInlines(value: unknown): Inline[] {
  if (!Array.isArray(value)) return [];
  const inlines: Inline[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.text !== 'string') continue;
    inlines.push({
      text: o.text.slice(0, MAX_TEXT),
      bold: o.bold === true || undefined,
      italic: o.italic === true || undefined,
      underline: o.underline === true || undefined,
    });
  }
  return normalizeInlines(inlines);
}

function sanitizeBlock(value: unknown): Block | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  switch (o.type) {
    case 'heading': {
      const level = Math.min(5, Math.max(1, Math.round(Number(o.level) || 1))) as HeadingLevel;
      return { type: 'heading', level, inlines: sanitizeInlines(o.inlines) };
    }
    case 'paragraph':
      return { type: 'paragraph', inlines: sanitizeInlines(o.inlines) };
    case 'reference':
      return { type: 'reference', inlines: sanitizeInlines(o.inlines) };
    case 'blockquote': {
      const paragraphs = Array.isArray(o.paragraphs) ? o.paragraphs.map(sanitizeInlines).filter((p) => p.length) : [];
      return paragraphs.length ? { type: 'blockquote', paragraphs } : null;
    }
    default:
      return null;
  }
}

/** Coerce untrusted JSON into a well-formed Paper. Unknown fields are dropped. */
export function validatePaper(input: unknown): Paper {
  if (!input || typeof input !== 'object') throw new Error('Expected a paper object');
  const o = input as Record<string, unknown>;
  const meta = (o.meta ?? {}) as Record<string, unknown>;
  const opts = (o.options ?? {}) as Record<string, unknown>;
  const defaults = defaultOptions();

  const font = (['times', 'calibri', 'arial', 'georgia'] as FontChoice[]).includes(opts.font as FontChoice)
    ? (opts.font as FontChoice)
    : defaults.font;

  const blocks: Block[] = [];
  if (Array.isArray(o.blocks)) {
    for (const raw of o.blocks.slice(0, MAX_BLOCKS)) {
      const block = sanitizeBlock(raw);
      if (block) blocks.push(block);
    }
  }

  return {
    meta: {
      title: str(meta.title),
      authors: str(meta.authors),
      affiliation: str(meta.affiliation),
      course: str(meta.course),
      instructor: str(meta.instructor),
      dueDate: str(meta.dueDate),
      authorNote: str(meta.authorNote, 10_000),
    },
    options: {
      paperType: opts.paperType === 'professional' ? 'professional' : 'student',
      font,
      includeRunningHead: bool(opts.includeRunningHead, defaults.includeRunningHead),
      runningHead: str(opts.runningHead, 200),
      includeAbstract: bool(opts.includeAbstract, defaults.includeAbstract),
      abstract: str(opts.abstract, 10_000),
      keywords: str(opts.keywords, 1000),
      alphabetizeReferences: bool(opts.alphabetizeReferences, defaults.alphabetizeReferences),
      fixHeadingCase: bool(opts.fixHeadingCase, defaults.fixHeadingCase),
    },
    blocks,
    warnings: Array.isArray(o.warnings) ? o.warnings.filter((w): w is string => typeof w === 'string').slice(0, 100) : [],
  };
}
