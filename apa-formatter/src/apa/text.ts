/**
 * Small, deterministic text rules from the APA 7 manual.
 */

/** Words APA leaves lowercase in title case unless they start or end the title (§6.17). */
const MINOR_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'vs.', 'v.',
]);

const HAS_LETTER = /\p{L}/u;

function capitalizeCore(core: string): string {
  // Preserve acronyms (DNA, COVID-19) and words with internal capitals (iPhone, McDonald).
  const letters = core.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) return core;
  if (/\p{Lu}/u.test(core.slice(1))) return core;
  if (/\d/.test(core) && /\p{Lu}/u.test(core)) return core;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function titleCaseWord(word: string, force: boolean): string {
  // Peel leading/trailing punctuation so quotes and parentheses don't hide the first letter.
  const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(word);
  if (!match) return word;
  const [, lead = '', core = '', trail = ''] = match;
  if (!HAS_LETTER.test(core)) return word;

  // Hyphenated compounds capitalize each part: "Self-Esteem", "Long-Term".
  if (core.includes('-') && core.length > 1) {
    const parts = core.split('-').map((part, i) => titleCaseWord(part, force || i > 0));
    return lead + parts.join('-') + trail;
  }

  if (!force && MINOR_WORDS.has(core.toLowerCase())) return lead + core.toLowerCase() + trail;
  return lead + capitalizeCore(core) + trail;
}

/**
 * APA title case: capitalize major words, lowercase short conjunctions, articles
 * and prepositions, always capitalize the first and last word and the first
 * word after a colon or dash.
 */
export function toTitleCase(input: string): string {
  let text = input.trim().replace(/\s+/g, ' ');
  if (!text) return text;
  // A title typed in ALL CAPS has no case information to preserve.
  if (text === text.toUpperCase() && HAS_LETTER.test(text)) text = text.toLowerCase();

  const words = text.split(' ');
  return words
    .map((word, i) => {
      const prev = i > 0 ? words[i - 1] ?? '' : '';
      const afterBreak = /[:—–?!.]$/.test(prev) || prev === '-' || prev === '—' || prev === '–';
      const force = i === 0 || i === words.length - 1 || afterBreak;
      return titleCaseWord(word, force);
    })
    .join(' ');
}

/** One space after periods, no doubled spaces, no stray whitespace (§6.1). */
export function normalizeSpacing(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').trim();
}

/** "pp. 23-24" → "pp. 23–24" (en dash in page ranges). */
export function fixPageRanges(text: string): string {
  return text.replace(/(\bpp?\.\s?)(\d+)\s*-\s*(\d+)/g, '$1$2–$3');
}

/**
 * In a reference entry every numeric range (pages, volumes, years) takes an en
 * dash. URLs and DOIs are left alone.
 */
export function fixReferenceDashes(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => (/https?:\/\/|doi|\//i.test(token) ? token : token.replace(/(\d)\s?-\s?(\d)/g, '$1–$2')))
    .join('');
}

/** Running head: title in capitals, at most 50 characters, cut at a word boundary (§2.8). */
export function makeRunningHead(title: string): string {
  const upper = normalizeSpacing(title).toUpperCase();
  if (upper.length <= 50) return upper;
  const cut = upper.slice(0, 50);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,:;—–-]+$/, '');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthIndex(name: string): number {
  const lower = name.toLowerCase().replace(/\.$/, '');
  return MONTHS.findIndex((m) => m.toLowerCase() === lower || m.slice(0, 3).toLowerCase() === lower || (lower === 'sept' && m === 'September'));
}

/**
 * Normalize a typed date to APA's "Month Day, Year". Anything unparseable is
 * returned unchanged, so the student's own wording is never destroyed.
 */
export function formatDueDate(input: string): string {
  const text = input.trim().replace(/^(due|date|due date|submitted)\s*:?\s*/i, '');
  if (!text) return '';

  let m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(text); // October 5, 2026 / Oct 5 2026
  if (m) {
    const month = monthIndex(m[1] ?? '');
    if (month >= 0) return `${MONTHS[month]} ${Number(m[2])}, ${m[3]}`;
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(text); // 5 October 2026
  if (m) {
    const month = monthIndex(m[2] ?? '');
    if (month >= 0) return `${MONTHS[month]} ${Number(m[1])}, ${m[3]}`;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text); // 10/5/2026 (US order)
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = m[3]!.length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${MONTHS[month - 1]} ${day}, ${year}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text); // 2026-10-05
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${Number(m[3])}, ${m[1]}`;
  }
  return input.trim();
}

/** Does this line look like a date a student would put on a paper? */
export function looksLikeDate(text: string): boolean {
  const t = text.trim();
  return (
    /^(due|date|due date|submitted)\s*:/i.test(t) ||
    /^([A-Za-z]{3,9})\.?\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}$/.test(t) ||
    /^\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}$/.test(t) ||
    /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t) ||
    /^\d{4}-\d{2}-\d{2}$/.test(t)
  );
}
