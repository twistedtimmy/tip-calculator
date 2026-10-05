import path from 'node:path';
import type { Paper } from '../model.js';
import { convertWithLibreOffice, findLibreOffice } from './convert.js';
import { docxToBlocks } from './docx.js';
import { markdownToBlocks } from './markdown.js';
import { buildPaper } from './structure.js';
import { looksLikeMarkdown, textToBlocks } from './text.js';

export const SUPPORTED_EXTENSIONS = ['.docx', '.doc', '.odt', '.rtf', '.txt', '.md', '.markdown'];

/** Parse an uploaded file into a Paper. */
export async function parseDocument(buffer: Buffer, filename: string): Promise<Paper> {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.docx':
      return buildPaper(await docxToBlocks(buffer), { filename });
    case '.doc':
    case '.odt':
    case '.rtf': {
      if (!(await findLibreOffice())) {
        throw new Error(`${ext} files need LibreOffice on the server. Save the paper as .docx and try again.`);
      }
      const docx = await convertWithLibreOffice(buffer, ext, 'docx');
      return buildPaper(await docxToBlocks(docx), { filename });
    }
    case '.md':
    case '.markdown':
      return buildPaper(await markdownToBlocks(buffer.toString('utf8')), { filename });
    case '.txt':
    case '':
      return parseText(buffer.toString('utf8'), filename);
    default:
      throw new Error(`Unsupported file type "${ext}". Upload ${SUPPORTED_EXTENSIONS.join(', ')} — or export Google Docs as Word.`);
  }
}

/** Parse pasted text (plain or Markdown) into a Paper. */
export async function parseText(text: string, filename?: string): Promise<Paper> {
  if (!text.trim()) throw new Error('There is no text to format.');
  const raw = looksLikeMarkdown(text) ? await markdownToBlocks(text) : textToBlocks(text);
  return buildPaper(raw, { filename });
}
