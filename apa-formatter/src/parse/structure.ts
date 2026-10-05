/**
 * Turns raw parsed blocks into a Paper: finds the title-page lines a student
 * typed at the top, the abstract, the headings, the reference list and any
 * long quotations, and cleans the text. Everything here is a heuristic, so the
 * UI lets the student correct the result.
 */
import type { Block, HeadingLevel, Inline, Paper, TitlePage } from '../model.js';
import { defaultOptions, emptyMeta, inlineText, normalizeInlines, wordCount } from '../model.js';
import { fixPageRanges, fixReferenceDashes, formatDueDate, looksLikeDate, toTitleCase } from '../apa/text.js';
import type { RawBlock, RawResult } from './raw.js';

const REFERENCE_HEADINGS = /^(references?|reference list|works cited|bibliography|sources( cited)?|citations|literature cited)\s*:?$/i;
const ABSTRACT_HEADING = /^abstract\s*:?$/i;
const INTRO_HEADING = /^introduction\s*:?$/i;
const SECTION_WORDS =
  /^(introduction|background|literature review|review of (the )?literature|method(s|ology)?|materials and methods|participants|procedures?|measures|results|findings|discussion|results and discussion|general discussion|conclusions?|implications|limitations|future (research|directions)|recommendations|summary|analysis|appendix( [a-z])?)\s*:?$/i;

const LABELS: Array<[RegExp, keyof TitlePage]> = [
  [/^title\s*[:\-–]\s*(.+)$/i, 'title'],
  [/^(?:name|student(?: name)?|author|written by|submitted by)\s*[:\-–]\s*(.+)$/i, 'authors'],
  [/^(?:course|class|subject|module)\s*[:\-–]\s*(.+)$/i, 'course'],
  [/^(?:instructor|professor|teacher|lecturer|tutor|prof\.?|taught by)\s*[:\-–]\s*(.+)$/i, 'instructor'],
  [/^(?:date|due(?: date)?|submitted(?: on)?|due on)\s*[:\-–]\s*(.+)$/i, 'dueDate'],
  [/^(?:school|university|college|institution|department|affiliation|program)\s*[:\-–]\s*(.+)$/i, 'affiliation'],
];
const COURSE_CODE = /\b[A-Z]{2,5}\s?-?\s?\d{3,4}[A-Z]?\b/;
const INSTRUCTOR = /^(prof(essor|\.)?|dr\.?|instructor|mr\.?|ms\.?|mrs\.?|mx\.?)\s+\S|\b(professor|instructor)\b/i;
const NAME_LIKE = /^(?:[\p{Lu}][\p{L}'’-]*\.?\s+){1,3}[\p{Lu}][\p{L}'’-]+$/u;
const TERM_LIKE = /^(?:(?:fall|spring|summer|winter|autumn|semester|term|quarter|trimester|session)\b.*\b\d{4}|\d{4})$/i;
const ASSIGNMENT_LABEL = /^(?:essay|assignment|paper|project|homework|lab|report|final|midterm|exam|draft|unit|week|module)\b/i;

/** One name, or several joined by commas, "and" or "&": "Jordan Rivera and Sam Lee". */
function looksLikeName(line: string): boolean {
  if (line.length > 80) return false;
  const parts = line.split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean);
  return parts.length > 0 && parts.length <= 4 && parts.every((part) => part.length <= 40 && NAME_LIKE.test(part));
}

/**
 * "Department of Psychology, Example University" — the institution word heads
 * the phrase or ends it. A title such as "Stress in College Students" does not
 * qualify, because "College" is followed by more words.
 */
function looksLikeAffiliation(line: string): boolean {
  if (wordCount(line) > 10) return false;
  return line.split(/[,;]/).some((part) => {
    const p = part.trim().replace(/\.$/, '');
    return /^(?:department|school|college|faculty|institute|university|academy|division|program) of\b/i.test(p) || /\b(?:university|college|institute|academy|polytechnic|school)$/i.test(p);
  });
}
const LONG_QUOTE = /^[“"]([^“”"]{150,})[”"]\s*(\([^()]{3,}\))?\s*\.?$/su;

const text = (b: RawBlock): string => (b.kind === 'blockquote' ? (b.paragraphs ?? []).map(inlineText).join(' ') : inlineText(b.inlines)).trim();
const isSectionMarker = (t: string): boolean => SECTION_WORDS.test(t) || REFERENCE_HEADINGS.test(t) || ABSTRACT_HEADING.test(t);

export function buildPaper(raw: RawResult, ctx: { filename?: string } = {}): Paper {
  const warnings = [...raw.warnings];
  let blocks = raw.blocks.filter((b) => text(b) !== '');
  const meta = emptyMeta();
  const options = defaultOptions();

  const titleIdx = blocks.findIndex((b) => b.kind === 'title');
  if (titleIdx >= 0) {
    meta.title = text(blocks[titleIdx]!);
    blocks.splice(titleIdx, 1);
  } else {
    // "# Title" above "## Section" headings: a top heading that outranks every other one is the title.
    const first = blocks[0];
    if (first?.kind === 'heading' && first.explicit) {
      const others = blocks.slice(1).filter((b) => b.kind === 'heading' && b.explicit);
      if (others.length && others.every((b) => (b.level ?? 1) > (first.level ?? 1))) {
        meta.title = text(first);
        blocks.splice(0, 1);
      }
    }
  }

  blocks = extractFrontMatter(blocks, meta, warnings);
  blocks = promoteKnownHeadings(blocks);
  blocks = extractAbstract(blocks, options);
  if (!blocks.some((b) => b.kind === 'heading' && b.explicit)) blocks = detectHeadings(blocks);

  const { body, references } = splitReferences(blocks, warnings);
  const bodyBlocks = finalizeBody(removeIntroductionHeading(normalizeHeadingLevels(body), warnings), warnings);
  const referenceBlocks: Block[] = references.map((inlines) => ({ type: 'reference', inlines: cleanInlines(inlines, fixReferenceDashes) }));

  meta.dueDate = formatDueDate(meta.dueDate);
  meta.authors = meta.authors.replace(/^by\s+/i, '');
  if (!meta.title) meta.title = titleFromFilename(ctx.filename);

  return { meta, options, blocks: [...bodyBlocks, ...referenceBlocks], warnings };
}

// ---------------------------------------------------------------------------
// Title page
// ---------------------------------------------------------------------------

function isShortLine(block: RawBlock): boolean {
  if (block.kind === 'blockquote' || block.kind === 'reference') return false;
  const t = text(block);
  const words = wordCount(t);
  if (words === 0 || words > 15) return false;
  if (/^[“"]/.test(t)) return false;
  if (/[.!?]$/.test(t) && words > 6 && !looksLikeDate(t)) return false; // a sentence, not a label
  return true;
}

function extractFrontMatter(blocks: RawBlock[], meta: TitlePage, warnings: string[]): RawBlock[] {
  let count = 0;
  while (count < blocks.length && count < 10) {
    const block = blocks[count]!;
    if (!isShortLine(block) || isSectionMarker(text(block))) break;
    // A styled heading below the title, or below other title-page lines, is where the body starts.
    if (block.kind === 'heading' && block.explicit && (count > 0 || meta.title)) break;
    count++;
  }
  if (count === 0) return blocks;

  const lines = blocks.slice(0, count);
  const rest = blocks.slice(count);
  const keep: RawBlock[] = [];
  const unplaced: string[] = [];

  // Pass 1: lines that announce what they are.
  for (const block of lines) {
    if (!assignLabeledLine(text(block), meta)) unplaced.push(text(block));
  }

  // Pass 2, in document order: the first unclaimed line that isn't a person's
  // name is the title; names become the author, then the instructor.
  // (The title repeated above the body text, as APA papers do, is not a subtitle.)
  const candidates = unplaced.filter((line) => line.toLowerCase() !== meta.title.toLowerCase());
  const labels = candidates.filter((line) => ASSIGNMENT_LABEL.test(line) && wordCount(line) <= 4);
  for (const line of labels) warnings.push(`Left out "${line}": assignment labels don't belong on an APA title page.`);
  let remaining = candidates.filter((line) => !labels.includes(line));
  if (!meta.title) {
    // With a course, instructor or date around it, a lone name is the author, not the title.
    const evidence = !!(meta.course || meta.instructor || meta.dueDate || meta.affiliation);
    const titleLine = remaining.find((line) => !looksLikeName(line)) ?? (evidence ? undefined : remaining[0]);
    if (titleLine) {
      meta.title = titleLine;
      remaining = remaining.filter((line) => line !== titleLine);
    }
  }
  const leftovers: string[] = [];
  for (const line of remaining) {
    if (looksLikeName(line)) {
      if (!meta.authors) meta.authors = line;
      else if (!meta.instructor) meta.instructor = line;
      else leftovers.push(line);
    } else {
      leftovers.push(line);
    }
  }
  if (leftovers.length === 1 && wordCount(leftovers[0]!) <= 12 && meta.title && /\p{L}/u.test(leftovers[0]!) && !TERM_LIKE.test(leftovers[0]!)) {
    meta.title = `${meta.title}: ${leftovers[0]}`; // a subtitle on its own line
    leftovers.length = 0;
  }
  for (const line of leftovers) {
    warnings.push(`Couldn't tell what "${line}" is at the top of the paper, so it was kept as body text. Delete it in Structure if it belongs on the title page.`);
    keep.push({ kind: 'paragraph', inlines: [{ text: line }] });
  }
  return [...keep, ...rest];
}

function assignLabeledLine(line: string, meta: TitlePage): boolean {
  for (const [re, field] of LABELS) {
    const m = re.exec(line);
    if (m) {
      meta[field] = m[1]!.trim();
      return true;
    }
  }
  const by = /^by\s+(.+)$/i.exec(line);
  if (by) {
    meta.authors ||= by[1]!.trim();
    return true;
  }
  if (looksLikeDate(line) || (TERM_LIKE.test(line) && wordCount(line) <= 4)) {
    meta.dueDate ||= line; // "Fall 2026" is the closest thing to a due date the student gave us
    return true;
  }
  if (COURSE_CODE.test(line) && wordCount(line) <= 10) {
    meta.course ||= line;
    return true;
  }
  if (INSTRUCTOR.test(line) && wordCount(line) <= 6) {
    meta.instructor ||= line;
    return true;
  }
  if (looksLikeAffiliation(line)) {
    meta.affiliation ||= line;
    return true;
  }
  return false;
}

function titleFromFilename(filename?: string): string {
  const base = (filename ?? '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return base ? toTitleCase(base) : 'Untitled Paper';
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function heading(block: RawBlock, level: number): RawBlock {
  return { kind: 'heading', level, inlines: block.inlines, explicit: block.explicit };
}

/** "References", "Abstract" and common section names are headings whatever style they were typed in. */
function promoteKnownHeadings(blocks: RawBlock[]): RawBlock[] {
  return blocks.map((b) => (b.kind === 'paragraph' && wordCount(text(b)) <= 4 && isSectionMarker(text(b)) ? heading(b, 1) : b));
}

function extractAbstract(blocks: RawBlock[], options: Paper['options']): RawBlock[] {
  const first = blocks[0];
  if (!first || first.kind === 'blockquote' || !ABSTRACT_HEADING.test(text(first))) return blocks;
  const rest = blocks.slice(1);
  const abstract: string[] = [];
  let used = 0;
  for (const block of rest) {
    if (block.kind !== 'paragraph') break;
    const t = text(block);
    const keywords = /^keywords\s*:\s*(.*)$/i.exec(t);
    if (keywords) {
      options.keywords = keywords[1]!.trim();
      used++;
      break;
    }
    if (isSectionMarker(t)) break;
    abstract.push(t);
    used++;
  }
  options.abstract = abstract.join(' ');
  options.includeAbstract = options.abstract.length > 0;
  return rest.slice(used);
}

function isAllBold(block: RawBlock): boolean {
  return block.inlines.some((i) => /\p{L}/u.test(i.text)) && block.inlines.every((i) => i.bold || !/\p{L}/u.test(i.text));
}

/** Without Word heading styles, a short bold or unterminated line above a paragraph is a heading. */
function detectHeadings(blocks: RawBlock[]): RawBlock[] {
  return blocks.map((block, i) => {
    if (block.kind !== 'paragraph') return block;
    const t = text(block);
    const words = wordCount(t);
    if (words <= 15 && isAllBold(block)) return heading(block, 1);
    const next = blocks[i + 1];
    if (
      words <= 12 &&
      !/[.!?,;]$/.test(t) &&
      /^[\p{Lu}\p{N}]/u.test(t) &&
      !looksLikeDate(t) &&
      next?.kind === 'paragraph' &&
      wordCount(text(next)) >= 20
    ) {
      return heading(block, 1);
    }
    return block;
  });
}

function splitReferences(blocks: RawBlock[], warnings: string[]): { body: RawBlock[]; references: Inline[][] } {
  const idx = blocks.findIndex((b) => (b.kind === 'heading' || b.kind === 'paragraph') && REFERENCE_HEADINGS.test(text(b)));
  const before = idx >= 0 ? blocks.slice(0, idx) : blocks;
  const after = idx >= 0 ? blocks.slice(idx + 1) : [];
  const body: RawBlock[] = [];
  const references: Inline[][] = [];

  for (const block of before) {
    if (block.kind === 'reference') references.push(block.inlines);
    else body.push(block);
  }
  let stopped = false;
  for (const block of after) {
    if (stopped) {
      body.push(block);
      continue;
    }
    if (block.kind === 'heading') {
      stopped = true;
      body.push(block);
      warnings.push(`"${text(block)}" came after the reference list, so it was moved in front of it. APA puts appendices after the references; add them back by hand if you need them there.`);
      continue;
    }
    if (block.kind === 'blockquote') references.push(...(block.paragraphs ?? []));
    else references.push(block.inlines);
  }
  if (references.length === 0) {
    warnings.push('No reference list was found. Add a "References" heading followed by one entry per paragraph and the formatter will give it a hanging indent.');
  }
  return { body, references };
}

function normalizeHeadingLevels(body: RawBlock[]): RawBlock[] {
  const levels = body.filter((b) => b.kind === 'heading').map((b) => b.level ?? 1);
  const min = levels.length ? Math.min(...levels) : 1;
  if (min <= 1) return body;
  return body.map((b) => (b.kind === 'heading' ? { ...b, level: (b.level ?? 1) - (min - 1) } : b));
}

function removeIntroductionHeading(body: RawBlock[], warnings: string[]): RawBlock[] {
  const idx = body.findIndex((b) => b.kind === 'heading');
  if (idx >= 0 && INTRO_HEADING.test(text(body[idx]!))) {
    warnings.push('Removed the "Introduction" heading: APA 7 papers open under the title, with no heading for the introduction (§2.27).');
    return [...body.slice(0, idx), ...body.slice(idx + 1)];
  }
  return body;
}

// ---------------------------------------------------------------------------
// Text clean-up
// ---------------------------------------------------------------------------

function cleanInlines(inlines: Inline[], extra?: (s: string) => string): Inline[] {
  const cleaned = normalizeInlines(inlines).map((inline) => {
    let t = inline.text.replace(/[\s ]+/g, ' ');
    t = fixPageRanges(t);
    if (extra) t = extra(t);
    return { ...inline, text: t };
  });
  if (cleaned.length) {
    cleaned[0]!.text = cleaned[0]!.text.replace(/^\s+/, '');
    cleaned[cleaned.length - 1]!.text = cleaned[cleaned.length - 1]!.text.replace(/\s+$/, '');
  }
  return normalizeInlines(cleaned);
}

function stripHeadingPunctuation(inlines: Inline[]): Inline[] {
  const out = cleanInlines(inlines);
  const last = out[out.length - 1];
  if (last) last.text = last.text.replace(/[.:]+$/, '');
  return normalizeInlines(out);
}

/** A whole paragraph inside quotation marks, 40+ words long, is an APA block quotation (§8.27). */
function toBlockQuote(inlines: Inline[]): Inline[][] | null {
  const m = LONG_QUOTE.exec(inlineText(inlines).trim());
  if (!m) return null;
  const inner = m[1]!.trim();
  if (wordCount(inner) < 40) return null;
  const sentence = /[.!?]$/.test(inner) ? inner : `${inner}.`;
  return [[{ text: m[2] ? `${sentence} ${m[2]}` : sentence }]];
}

function finalizeBody(body: RawBlock[], warnings: string[]): Block[] {
  const out: Block[] = [];
  for (const block of body) {
    if (block.kind === 'heading') {
      const level = Math.min(5, Math.max(1, block.level ?? 1)) as HeadingLevel;
      const inlines = stripHeadingPunctuation(block.inlines);
      if (inlines.length) out.push({ type: 'heading', level, inlines });
    } else if (block.kind === 'blockquote') {
      const paragraphs = (block.paragraphs ?? []).map((p) => cleanInlines(p)).filter((p) => p.length);
      if (!paragraphs.length) continue;
      if (wordCount(paragraphs.map(inlineText).join(' ')) < 40) {
        warnings.push('A block quotation is shorter than 40 words. APA 7 runs quotations under 40 words into the paragraph in quotation marks (§8.26).');
      }
      out.push({ type: 'blockquote', paragraphs });
    } else {
      const inlines = cleanInlines(block.inlines);
      if (!inlines.length) continue;
      const quote = toBlockQuote(inlines);
      if (quote) out.push({ type: 'blockquote', paragraphs: quote });
      else out.push({ type: 'paragraph', inlines });
    }
  }
  return out;
}
