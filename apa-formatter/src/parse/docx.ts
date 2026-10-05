import mammoth from 'mammoth';
import { htmlToBlocks } from './html.js';
import type { RawResult } from './raw.js';

/**
 * Word styles that tell us what a paragraph is. Mammoth's default map already
 * turns Heading 1–6 into h1–h6 and bold/italic runs into strong/em.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  "p[style-name='Block Quotation'] => blockquote > p:fresh",
  "p[style-name='Block Quote'] => blockquote > p:fresh",
  "p[style-name='Bibliography'] => p.reference:fresh",
  "p[style-name='Reference'] => p.reference:fresh",
  "p[style-name='Reference Entry'] => p.reference:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  'u => u',
];

export async function docxToBlocks(buffer: Buffer): Promise<RawResult> {
  const result = await mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP, includeDefaultStyleMap: true, ignoreEmptyParagraphs: true });
  const parsed = htmlToBlocks(result.value);
  // Mammoth reports every unmapped style; those are fine. Keep anything else.
  const notable = result.messages
    .filter((m) => m.type === 'warning' && !/Unrecognised (paragraph|run) style/i.test(m.message))
    .map((m) => m.message);
  if (result.messages.some((m) => /image/i.test(m.message))) {
    notable.push('Images were left out. Figures need an APA figure number, title and note, so add them back by hand.');
  }
  return { blocks: parsed.blocks, warnings: [...parsed.warnings, ...new Set(notable)] };
}
