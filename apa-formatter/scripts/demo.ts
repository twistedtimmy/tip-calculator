/**
 * Format a document from the command line.
 *
 *   npm run demo -- samples/sample-draft.txt out/
 *
 * Writes <name>.docx, <name>.pdf (when LibreOffice or Chromium is available),
 * <name>.html (the preview) and <name>.json (the parsed paper) into the
 * output directory.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from '../src/parse/index.js';
import { renderDocx } from '../src/render/docx.js';
import { renderHtml } from '../src/render/html.js';
import { detectPdfEngine, renderPdf } from '../src/render/pdf.js';

const [input = 'samples/sample-draft.txt', outDir = 'out'] = process.argv.slice(2);

const paper = await parseDocument(await readFile(input), path.basename(input));
await mkdir(outDir, { recursive: true });
const base = path.join(outDir, path.basename(input).replace(/\.[^.]+$/, ''));

await writeFile(`${base}.json`, JSON.stringify(paper, null, 2));
await writeFile(`${base}.html`, renderHtml(paper, 'preview'));
await writeFile(`${base}.docx`, await renderDocx(paper));
console.log(`Title:      ${paper.meta.title}`);
console.log(`Author:     ${paper.meta.authors || '(none found)'}`);
console.log(`Blocks:     ${paper.blocks.length} (${paper.blocks.filter((b) => b.type === 'reference').length} references)`);
for (const warning of paper.warnings) console.log(`Note:       ${warning}`);
console.log(`Wrote:      ${base}.docx, ${base}.html, ${base}.json`);

const engine = await detectPdfEngine();
if (engine) {
  await writeFile(`${base}.pdf`, await renderPdf(paper));
  console.log(`Wrote:      ${base}.pdf (via ${engine})`);
} else {
  console.log('Skipped PDF: neither LibreOffice nor Chromium was found.');
}
