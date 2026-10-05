import { readFile } from 'node:fs/promises';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { blockText } from '../src/model.js';
import { parseDocument, parseText } from '../src/parse/index.js';

const sample = await readFile(new URL('../samples/sample-draft.txt', import.meta.url), 'utf8');

describe('plain-text sample paper', () => {
  it('lifts the title-page lines off the top of the document', async () => {
    const paper = await parseText(sample, 'sample-draft.txt');
    expect(paper.meta.title).toBe('Sleep Deprivation and Working Memory in College Students');
    expect(paper.meta.authors).toBe('Jordan Rivera');
    expect(paper.meta.instructor).toBe('Professor Elena Marsh');
    expect(paper.meta.course).toBe('PSY 201: Introduction to Psychology');
    expect(paper.meta.dueDate).toBe('October 5, 2026');
    expect(paper.meta.affiliation).toBe('');
  });

  it('detects headings, drops the Introduction heading and keeps the body in order', async () => {
    const paper = await parseText(sample);
    const headings = paper.blocks.filter((b) => b.type === 'heading').map(blockText);
    expect(headings).toEqual(['Literature Review', 'Methods', 'Results and Discussion', 'Conclusion']);
    expect(paper.warnings.some((w) => w.includes('Introduction'))).toBe(true);
    const first = paper.blocks[0]!;
    expect(first.type).toBe('paragraph');
    expect(blockText(first)).toMatch(/^College students routinely/);
  });

  it('turns a 40+ word quoted paragraph into a block quotation with the citation after the period', async () => {
    const paper = await parseText(sample);
    const quotes = paper.blocks.filter((b) => b.type === 'blockquote');
    expect(quotes).toHaveLength(1);
    const text = blockText(quotes[0]!);
    expect(text).toMatch(/^The pattern that emerges/);
    expect(text).toMatch(/obtained\. \(Okafor & Lindqvist, 2021, p\. 143\)$/);
    expect(text).not.toMatch(/[“”]/);
  });

  it('splits off the reference list and fixes its dashes without touching the DOI', async () => {
    const paper = await parseText(sample);
    const refs = paper.blocks.filter((b) => b.type === 'reference').map(blockText);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toContain('14(3), 211–229.');
    expect(refs[0]).toContain('https://doi.org/10.0000/jsc.2019.14.3.211');
    expect(paper.blocks.findIndex((b) => b.type === 'reference')).toBeGreaterThan(paper.blocks.findLastIndex((b) => b.type !== 'reference'));
  });

  it('joins hand-wrapped lines into one paragraph but keeps short lines apart', async () => {
    const wrapped = [
      'My Title',
      '',
      'This paragraph was typed in an editor that wraps lines by hand at about',
      'seventy characters, so every line ends without punctuation except for the',
      'final one, which closes the thought with a period.',
    ].join('\n');
    const paper = await parseText(wrapped);
    expect(paper.meta.title).toBe('My Title');
    expect(paper.blocks).toHaveLength(1);
    expect(blockText(paper.blocks[0]!)).toMatch(/^This paragraph was typed .* with a period\.$/);
  });
});

describe('markdown', () => {
  const md = [
    '# The Title',
    '',
    'Jordan Rivera',
    '',
    '## Background',
    '',
    'Some *italic* and **bold** text in a paragraph that is long enough to count as body text for the heading heuristics to leave it alone.',
    '',
    '> A quoted passage used as a block quote.',
    '',
    '## References',
    '',
    'Okafor, N. (2021). *Holding it together*. Press.',
    '',
  ].join('\n');

  it('uses the Markdown structure and normalizes heading levels', async () => {
    const paper = await parseText(md, 'paper.md');
    expect(paper.meta.title).toBe('The Title');
    expect(paper.meta.authors).toBe('Jordan Rivera');
    const headings = paper.blocks.filter((b) => b.type === 'heading');
    expect(headings.map(blockText)).toEqual(['Background']);
    expect(headings[0]!.type === 'heading' && headings[0]!.level).toBe(1);
    const paragraph = paper.blocks.find((b) => b.type === 'paragraph');
    expect(paragraph?.type === 'paragraph' && paragraph.inlines.some((i) => i.italic && i.text === 'italic')).toBe(true);
    expect(paragraph?.type === 'paragraph' && paragraph.inlines.some((i) => i.bold && i.text === 'bold')).toBe(true);
    expect(paper.blocks.some((b) => b.type === 'blockquote')).toBe(true);
    const ref = paper.blocks.find((b) => b.type === 'reference');
    expect(ref?.type === 'reference' && ref.inlines.some((i) => i.italic && i.text === 'Holding it together')).toBe(true);
  });
});

describe('docx', () => {
  it('reads Word styles for the title, headings, quotes and formatting runs', async () => {
    const doc = new Document({
      styles: { paragraphStyles: [{ id: 'Quote', name: 'Quote', basedOn: 'Normal', paragraph: { indent: { left: 720 } } }] },
      sections: [
        {
          children: [
            new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Sleep and Memory')] }),
            new Paragraph({ children: [new TextRun('Jordan Rivera')] }),
            new Paragraph({ children: [new TextRun('PSY 201')] }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Background')] }),
            new Paragraph({
              children: [
                new TextRun('Plain '),
                new TextRun({ text: 'bold', bold: true }),
                new TextRun(' and '),
                new TextRun({ text: 'italic', italics: true }),
                new TextRun(' text long enough to be a paragraph of body text in the document for testing purposes.'),
              ],
            }),
            new Paragraph({ style: 'Quote', children: [new TextRun('A quoted passage.')] }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('References')] }),
            new Paragraph({ children: [new TextRun('Okafor, N. (2021). '), new TextRun({ text: 'Holding it together', italics: true }), new TextRun('. Press.')] }),
          ],
        },
      ],
    });
    const buffer = Buffer.from(await Packer.toBuffer(doc));
    const paper = await parseDocument(buffer, 'draft.docx');

    expect(paper.meta.title).toBe('Sleep and Memory');
    expect(paper.meta.authors).toBe('Jordan Rivera');
    expect(paper.meta.course).toBe('PSY 201');
    expect(paper.blocks.filter((b) => b.type === 'heading').map(blockText)).toEqual(['Background']);
    const paragraph = paper.blocks.find((b) => b.type === 'paragraph');
    expect(paragraph?.type === 'paragraph' && paragraph.inlines.find((i) => i.bold)?.text).toBe('bold');
    expect(paragraph?.type === 'paragraph' && paragraph.inlines.find((i) => i.italic)?.text).toBe('italic');
    expect(paper.blocks.some((b) => b.type === 'blockquote' && blockText(b) === 'A quoted passage.')).toBe(true);
    const ref = paper.blocks.find((b) => b.type === 'reference');
    expect(ref && blockText(ref)).toBe('Okafor, N. (2021). Holding it together. Press.');
    expect(ref?.type === 'reference' && ref.inlines.some((i) => i.italic)).toBe(true);
  });

  it('rejects unknown file types with a helpful message', async () => {
    await expect(parseDocument(Buffer.from('x'), 'paper.pages')).rejects.toThrow(/Unsupported file type/);
  });
});
