import type { Inline, Paper } from '../model.js';
import { preparePaper, type Prepared } from './prepare.js';

export type HtmlMode = 'preview' | 'print';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ')}"`;

function inlinesHtml(inlines: Inline[]): string {
  return inlines
    .map((i) => {
      let html = esc(i.text);
      if (i.bold) html = `<b>${html}</b>`;
      if (i.italic) html = `<i>${html}</i>`;
      if (i.underline) html = `<u>${html}</u>`;
      return html;
    })
    .join('');
}

const blank = '<p class="blank noindent">&nbsp;</p>';

function titlePageHtml(p: Prepared): string {
  const parts = [blank, blank, blank, `<p class="center noindent"><b>${esc(p.title)}</b></p>`, blank];
  for (const line of p.titleLines) parts.push(`<p class="center noindent">${esc(line)}</p>`);
  if (p.authorNote) {
    parts.push(blank, blank, blank, blank, `<p class="center noindent"><b>Author Note</b></p>`);
    for (const para of p.authorNote.split(/\n\s*\n|\n/)) if (para.trim()) parts.push(`<p>${esc(para.trim())}</p>`);
  }
  return parts.join('\n');
}

function abstractHtml(p: Prepared): string {
  const parts = [`<h1>Abstract</h1>`, `<p class="noindent">${esc(p.abstract ?? '')}</p>`];
  if (p.keywords) parts.push(`<p><i>Keywords:</i> ${esc(p.keywords)}</p>`);
  return parts.join('\n');
}

function bodyHtml(p: Prepared): string {
  const parts = [`<p class="center noindent"><b>${esc(p.title)}</b></p>`];
  for (const item of p.body) {
    if (item.kind === 'heading') {
      parts.push(`<h${item.level}>${inlinesHtml(item.inlines)}</h${item.level}>`);
    } else if (item.kind === 'blockquote') {
      parts.push(`<blockquote>${item.paragraphs.map((para) => `<p>${inlinesHtml(para)}</p>`).join('')}</blockquote>`);
    } else {
      const runIn = item.runIn ? `<span class="runin l${item.runIn.level}">${esc(item.runIn.text)}</span> ` : '';
      parts.push(`<p>${runIn}${inlinesHtml(item.inlines)}</p>`);
    }
  }
  return parts.join('\n');
}

function referencesHtml(p: Prepared): string {
  return [`<h1>References</h1>`, ...p.references.map((entry) => `<p class="ref">${inlinesHtml(entry)}</p>`)].join('\n');
}

function css(p: Prepared, mode: HtmlMode): string {
  const base = `
    html, body { margin: 0; padding: 0; }
    body { font-family: ${p.font.cssStack}; font-size: ${p.font.sizePt}pt; line-height: 2; color: #000; background: #fff;
           text-align: left; hyphens: none; -webkit-hyphens: none; }
    p { margin: 0; text-indent: 0.5in; orphans: 2; widows: 2; }
    p.noindent, p.blank { text-indent: 0; }
    .center { text-align: center; }
    h1, h2, h3 { font-size: inherit; font-weight: bold; margin: 0; line-height: 2; break-after: avoid; }
    h1 { text-align: center; }
    h2 { text-align: left; }
    h3 { text-align: left; font-style: italic; }
    .runin { font-weight: bold; }
    .runin.l5 { font-style: italic; }
    blockquote { margin: 0 0 0 0.5in; }
    blockquote p { text-indent: 0; }
    blockquote p + p { text-indent: 0.5in; }
    p.ref { text-indent: -0.5in; padding-left: 0.5in; }
    b, strong { font-weight: bold; }
  `;
  if (mode === 'print') {
    // Page number (and running head) live in the page margin boxes, ~0.5in from the top (§2.18).
    const headerFont = `font-family: ${p.font.cssStack}; font-size: ${p.font.sizePt}pt; vertical-align: middle;`;
    const runningHead = p.runningHead ? `@top-left { content: ${cssString(p.runningHead)}; ${headerFont} }` : '';
    return `${base}
    @page { size: Letter; margin: 1in; @top-right { content: counter(page); ${headerFont} } ${runningHead} }
    .page { break-after: page; }
    .page:last-child { break-after: auto; }`;
  }
  return `${base}
    body { background: #e4e6eb; padding: 24px 12px; }
    .page { position: relative; width: 8.5in; max-width: 100%; min-height: 11in; margin: 0 auto 24px; padding: 1in;
            background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08); box-sizing: border-box; }
    .page::before { content: attr(data-page); position: absolute; top: 0.5in; right: 1in; line-height: 1; }
    .page::after { content: attr(data-head); position: absolute; top: 0.5in; left: 1in; line-height: 1; }
    @media (max-width: 8.5in) { .page { padding: 0.75in 0.5in; min-height: 0; } .page::before { right: 0.5in; } .page::after { left: 0.5in; } }`;
}

/**
 * Render the paper as HTML. `preview` draws paper sheets for the browser;
 * `print` is the paged layout Chromium turns into a PDF.
 */
export function renderHtml(paper: Paper, mode: HtmlMode = 'preview'): string {
  const p = preparePaper(paper);
  const head = p.runningHead ?? '';
  const sections: string[] = [];
  let page = 1;
  const section = (name: string, number: string, inner: string): string =>
    `<section class="page ${name}" data-page="${number}" data-head="${esc(head)}">\n${inner}\n</section>`;

  sections.push(section('title-page', String(page++), titlePageHtml(p)));
  if (p.abstract) sections.push(section('abstract', String(page++), abstractHtml(p)));
  sections.push(section('body', String(page), bodyHtml(p)));
  if (p.references.length) sections.push(section('references', '', referencesHtml(p)));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(p.title)}</title>
<style>${css(p, mode)}</style>
</head>
<body class="${mode}">
${sections.join('\n')}
</body>
</html>`;
}
