import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Paper } from '../src/model.js';
import { parseText } from '../src/parse/index.js';
import { renderDocx } from '../src/render/docx.js';
import { renderHtml } from '../src/render/html.js';
import { detectPdfEngine, renderPdf } from '../src/render/pdf.js';

const execFileAsync = promisify(execFile);
const sample = await readFile(new URL('../samples/sample-draft.txt', import.meta.url), 'utf8');
const paper: Paper = await parseText(sample, 'sample-draft.txt');
const pdfEngine = await detectPdfEngine();
const hasPdftotext = await execFileAsync('pdftotext', ['-v']).then(() => true, () => false);

async function unzipDocx(buffer: Buffer): Promise<{ document: string; styles: string; header: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const read = (name: string): Promise<string> => zip.file(name)!.async('string');
  const headerName = Object.keys(zip.files).find((n) => /^word\/header\d*\.xml$/.test(n));
  expect(headerName, 'a header part').toBeDefined();
  return { document: await read('word/document.xml'), styles: await read('word/styles.xml'), header: await read(headerName!) };
}

describe('DOCX output', () => {
  it('has 1-inch margins, double spacing and a 12-pt Times New Roman default', async () => {
    const { document, styles } = await unzipDocx(await renderDocx(paper));
    expect(document).toMatch(/<w:pgMar [^>]*w:top="1440"[^>]*w:right="1440"[^>]*w:bottom="1440"[^>]*w:left="1440"/);
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*w:line="480"[\s\S]*w:lineRule="auto"[\s\S]*<\/w:docDefaults>/);
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*w:ascii="Times New Roman"[\s\S]*<\/w:docDefaults>/);
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="24"\/>[\s\S]*<\/w:docDefaults>/);
  });

  it('puts the page number in the header, top right', async () => {
    const { header } = await unzipDocx(await renderDocx(paper));
    expect(header).toMatch(/PAGE/);
    expect(header).toMatch(/<w:jc w:val="right"\/>/);
    expect(header).not.toMatch(/SLEEP DEPRIVATION/);
  });

  it('adds a running head on the left when asked', async () => {
    const withHead: Paper = { ...paper, options: { ...paper.options, includeRunningHead: true } };
    const { header } = await unzipDocx(await renderDocx(withHead));
    expect(header).toContain('SLEEP DEPRIVATION AND WORKING MEMORY IN COLLEGE');
    expect(header).toMatch(/<w:tab [^>]*w:val="right"/);
  });

  it('starts the body and the reference list on new pages and repeats the title', async () => {
    const { document } = await unzipDocx(await renderDocx(paper));
    const breaks = document.match(/<w:pageBreakBefore\/>/g) ?? [];
    expect(breaks.length).toBe(2);
    const titleCount = document.split('Sleep Deprivation and Working Memory in College Students').length - 1;
    expect(titleCount).toBe(2);
    expect(document).toContain('>References<');
  });

  it('indents paragraphs half an inch and gives references a hanging indent', async () => {
    const { document, styles } = await unzipDocx(await renderDocx(paper));
    expect(document).toMatch(/<w:ind [^>]*w:firstLine="720"/);
    expect(styles).toMatch(/w:styleId="ReferenceEntry"[\s\S]*?<w:ind [^>]*w:hanging="720"/);
    expect(styles).toMatch(/w:styleId="BlockQuote"[\s\S]*?<w:ind [^>]*w:left="720"/);
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?<w:jc w:val="center"\/>/);
    expect(styles).toMatch(/w:styleId="Heading3"[\s\S]*?<w:i\/>/);
  });

  it('alphabetizes the reference list', async () => {
    const { document } = await unzipDocx(await renderDocx(paper));
    const brennan = document.indexOf('Brennan, T. L.');
    const haddad = document.indexOf('Haddad, R.');
    const okafor = document.indexOf('Okafor, N.');
    expect(brennan).toBeGreaterThan(0);
    expect(brennan).toBeLessThan(haddad);
    expect(haddad).toBeLessThan(okafor);
  });

  it('switches fonts and sizes together', async () => {
    const calibri: Paper = { ...paper, options: { ...paper.options, font: 'calibri' } };
    const { styles } = await unzipDocx(await renderDocx(calibri));
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*w:ascii="Calibri"[\s\S]*<w:sz w:val="22"\/>/);
  });
});

describe('HTML output', () => {
  it('renders the title page, body, and a hanging-indent reference page', () => {
    const html = renderHtml(paper, 'preview');
    expect(html).toContain('class="page title-page"');
    expect(html).toContain('class="page references"');
    expect(html).toContain('<h1>References</h1>');
    expect(html).toContain('p.ref { text-indent: -0.5in; padding-left: 0.5in; }');
    expect(html).toContain('line-height: 2;');
    expect(html.split('Sleep Deprivation and Working Memory in College Students').length - 1).toBeGreaterThanOrEqual(3); // <title>, title page, body
    expect(html).toContain('<h1>Literature Review</h1>');
    expect(html).toContain('<blockquote><p>The pattern that emerges');
  });

  it('shows an abstract page only when requested and escapes text', () => {
    const withAbstract: Paper = {
      ...paper,
      options: { ...paper.options, includeAbstract: true, abstract: 'A <short> abstract.', keywords: 'sleep, memory' },
    };
    const html = renderHtml(withAbstract, 'print');
    expect(html).toContain('<h1>Abstract</h1>');
    expect(html).toContain('A &lt;short&gt; abstract.');
    expect(html).toContain('<i>Keywords:</i> sleep, memory');
    expect(renderHtml(paper, 'print')).not.toContain('<h1>Abstract</h1>');
  });

  it('title-cases headings without losing the spaces between formatted runs', () => {
    const mixed: Paper = {
      ...paper,
      blocks: [{ type: 'heading', level: 2, inlines: [{ text: 'working memory ' }, { text: 'and', italic: true }, { text: ' attention' }] }],
    };
    expect(renderHtml(mixed, 'print')).toContain('<h2>Working Memory <i>and</i> Attention</h2>');
  });

  it('runs level 4 and 5 headings into the following paragraph', () => {
    const runIn: Paper = {
      ...paper,
      blocks: [
        { type: 'heading', level: 4, inlines: [{ text: 'sample size' }] },
        { type: 'paragraph', inlines: [{ text: 'Two hundred students took part.' }] },
      ],
    };
    const html = renderHtml(runIn, 'print');
    expect(html).toContain('<p><span class="runin l4">Sample Size.</span> Two hundred students took part.</p>');
  });
});

describe('PDF output', () => {
  it.skipIf(!pdfEngine)('produces a PDF with the title page first and the references last', async () => {
    const pdf = await renderPdf(paper);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (!hasPdftotext) return;

    const dir = await mkdtemp(path.join(tmpdir(), 'apa-test-'));
    try {
      const file = path.join(dir, 'paper.pdf');
      await writeFile(file, pdf);
      const { stdout } = await execFileAsync('pdftotext', ['-layout', file, '-']);
      const pages = stdout.split('\f').filter((p) => p.trim());
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(pages[0]).toContain('Sleep Deprivation and Working Memory in College Students');
      expect(pages[0]).toContain('Jordan Rivera');
      expect(pages[0]).toContain('October 5, 2026');
      expect(pages[0]!.split('\n')[0]).toMatch(/\b1\s*$/); // page number top right of page 1
      expect(pages[pages.length - 1]).toContain('References');
      expect(pages[pages.length - 1]).toContain('Brennan, T. L.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
