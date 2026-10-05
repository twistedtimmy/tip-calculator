import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
  type IParagraphStyleOptions,
  type IRunOptions,
} from 'docx';
import type { Inline, Paper } from '../model.js';
import { preparePaper } from './prepare.js';

const HALF_INCH = 720; // twips
const INCH = 1440;
const DOUBLE_SPACED = 480; // 240 = single
const TEXT_WIDTH = 9360; // 6.5in: Letter width minus two 1in margins

/** Build an APA 7 formatted Word document from a paper. */
export async function renderDocx(paper: Paper): Promise<Buffer> {
  const p = preparePaper(paper);
  const fontName = p.font.name;
  const fontSize = p.font.sizePt * 2; // half-points
  const spacing = { line: DOUBLE_SPACED, lineRule: LineRuleType.AUTO, before: 0, after: 0 };

  const runs = (inlines: Inline[], extra: Partial<IRunOptions> = {}): TextRun[] =>
    inlines.map(
      (i) =>
        new TextRun({
          text: i.text,
          bold: i.bold || extra.bold || undefined,
          italics: i.italic || extra.italics || undefined,
          underline: i.underline ? {} : undefined,
        }),
    );
  const blank = (): Paragraph => new Paragraph({ children: [] });
  const centeredBold = (text: string, pageBreakBefore = false): Paragraph =>
    new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore, children: [new TextRun({ text, bold: true })] });
  const centered = (text: string): Paragraph => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(text)] });

  const headingStyle = (id: string, name: string, alignment: (typeof AlignmentType)[keyof typeof AlignmentType], italics = false): IParagraphStyleOptions => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { bold: true, italics, font: fontName, size: fontSize, color: '000000' },
    paragraph: { alignment, spacing, keepNext: true },
  });

  // Header: page number top right; running head top left when requested (§2.18).
  const header = p.runningHead
    ? new Paragraph({
        spacing: { line: 240 },
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
        children: [new TextRun(p.runningHead), new TextRun({ children: ['\t', PageNumber.CURRENT] })],
      })
    : new Paragraph({ spacing: { line: 240 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT] })] });

  const children: Paragraph[] = [];

  // Title page (§2.3–2.7): title in the upper half, then author lines, all centered and double-spaced.
  // The title carries Word's Title style so other tools (and this one) recognise it.
  children.push(blank(), blank(), blank(), new Paragraph({ style: 'Title', children: [new TextRun(p.title)] }), blank());
  for (const line of p.titleLines) children.push(centered(line));
  if (p.authorNote) {
    children.push(blank(), blank(), blank(), blank(), centeredBold('Author Note'));
    for (const para of p.authorNote.split(/\n\s*\n|\n/)) {
      if (para.trim()) children.push(new Paragraph({ indent: { firstLine: HALF_INCH }, children: [new TextRun(para.trim())] }));
    }
  }

  // Abstract (§2.9): own page, label centered, first line not indented.
  if (p.abstract) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Abstract')] }));
    children.push(new Paragraph({ children: [new TextRun(p.abstract)] }));
    if (p.keywords) {
      children.push(new Paragraph({ indent: { firstLine: HALF_INCH }, children: [new TextRun({ text: 'Keywords: ', italics: true }), new TextRun(p.keywords)] }));
    }
  }

  // Body (§2.11): new page, title repeated, then the text.
  children.push(centeredBold(p.title, true));
  for (const item of p.body) {
    if (item.kind === 'heading') {
      const level = item.level === 1 ? HeadingLevel.HEADING_1 : item.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({ heading: level, children: runs(item.inlines) }));
    } else if (item.kind === 'blockquote') {
      item.paragraphs.forEach((para, i) => {
        children.push(new Paragraph({ style: 'BlockQuote', indent: i > 0 ? { left: HALF_INCH, firstLine: HALF_INCH } : undefined, children: runs(para) }));
      });
    } else {
      const lead = item.runIn ? [new TextRun({ text: `${item.runIn.text} `, bold: true, italics: item.runIn.level === 5 })] : [];
      children.push(new Paragraph({ indent: { firstLine: HALF_INCH }, children: [...lead, ...runs(item.inlines)] }));
    }
  }

  // References (§2.12, §9.43): new page, label centered, hanging indents, double-spaced.
  if (p.references.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('References')] }));
    for (const entry of p.references) children.push(new Paragraph({ style: 'ReferenceEntry', children: runs(entry) }));
  }

  const doc = new Document({
    creator: paper.meta.authors.trim() || 'APA Formatter',
    title: p.title,
    description: 'Formatted to APA 7 student paper guidelines',
    styles: {
      default: {
        document: {
          run: { font: fontName, size: fontSize, color: '000000' },
          paragraph: { spacing, alignment: AlignmentType.LEFT },
        },
      },
      paragraphStyles: [
        headingStyle('Title', 'Title', AlignmentType.CENTER),
        headingStyle('Heading1', 'Heading 1', AlignmentType.CENTER),
        headingStyle('Heading2', 'Heading 2', AlignmentType.LEFT),
        headingStyle('Heading3', 'Heading 3', AlignmentType.LEFT, true),
        {
          id: 'BlockQuote',
          name: 'Block Quote',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          paragraph: { indent: { left: HALF_INCH }, spacing },
        },
        {
          id: 'ReferenceEntry',
          name: 'Reference Entry',
          basedOn: 'Normal',
          next: 'ReferenceEntry',
          quickFormat: true,
          paragraph: { indent: { left: HALF_INCH, hanging: HALF_INCH }, spacing },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: INCH, right: INCH, bottom: INCH, left: INCH, header: HALF_INCH, footer: HALF_INCH } },
        },
        headers: { default: new Header({ children: [header] }) },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
