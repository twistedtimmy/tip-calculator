import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import type { Paper } from '../model.js';
import { convertWithLibreOffice, findLibreOffice } from '../parse/convert.js';
import { renderDocx } from './docx.js';
import { renderHtml } from './html.js';

export type PdfEngine = 'libreoffice' | 'chromium';

function playwrightBrowsers(): string[] {
  const base = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (!base || !existsSync(base)) return [];
  return readdirSync(base)
    .filter((d) => d.startsWith('chromium'))
    .sort()
    .reverse()
    .map((d) => path.join(base, d, 'chrome-linux', d.includes('headless_shell') ? 'headless_shell' : 'chrome'));
}

let chromiumPath: string | null | undefined;

function findChromium(): string | null {
  if (chromiumPath !== undefined) return chromiumPath;
  const candidates = [
    process.env['CHROME_PATH'],
    process.env['CHROMIUM_PATH'],
    ...playwrightBrowsers(),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  chromiumPath = candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
  if (!chromiumPath) {
    try {
      const bundled = chromium.executablePath();
      if (bundled && existsSync(bundled)) chromiumPath = bundled;
    } catch {
      chromiumPath = null;
    }
  }
  return chromiumPath;
}

/**
 * LibreOffice converts the generated .docx, so the PDF matches the Word file
 * page for page. Chromium printing the HTML is the fallback.
 */
export async function detectPdfEngine(): Promise<PdfEngine | null> {
  if (await findLibreOffice()) return 'libreoffice';
  if (findChromium()) return 'chromium';
  return null;
}

async function renderWithChromium(paper: Paper, executablePath: string): Promise<Buffer> {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(paper, 'print'), { waitUntil: 'load' });
    // Page size, margins, page number and running head all come from the print CSS (@page rules).
    // Chromium's own headerTemplate is avoided: it renders at an unusable size in headless builds.
    const pdf = await page.pdf({ preferCSSPageSize: true, displayHeaderFooter: false, printBackground: false });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function renderPdf(paper: Paper): Promise<Buffer> {
  if (await findLibreOffice()) {
    const docx = await renderDocx(paper);
    return convertWithLibreOffice(docx, 'docx', 'pdf');
  }
  const executablePath = findChromium();
  if (executablePath) return renderWithChromium(paper, executablePath);
  throw new Error('PDF export needs LibreOffice or Chromium on the server. Download the .docx and export it to PDF from Word or Google Docs.');
}
