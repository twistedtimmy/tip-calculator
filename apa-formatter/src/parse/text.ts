import type { RawBlock, RawResult } from './raw.js';

/** "Surname, A. B." or "Group Author. (2020)." at the start of a line. */
export function looksLikeReferenceEntry(line: string): boolean {
  const t = line.trim();
  return /^[\p{Lu}][\p{L}'’-]+,\s+[\p{Lu}]\./u.test(t) || /^[\p{Lu}][^.]{1,80}\.\s+\(\d{4}[a-z]?(,\s*[^)]*)?\)\./u.test(t) || /^[\p{Lu}][^()]{1,80}\(\d{4}[a-z]?\)\.?\s/u.test(t);
}

/**
 * Lines that were wrapped by hand at ~70 characters belong to one paragraph.
 * Short lines (a title block, a heading, references) do not.
 */
function isHardWrapped(lines: string[]): boolean {
  if (lines.length < 2) return false;
  if (lines.some((l) => looksLikeReferenceEntry(l) || /^\s*([-*•]|\d+[.)])\s/.test(l))) return false;
  const body = lines.slice(0, -1);
  const unterminated = body.filter((l) => !/[.!?:"”’)]$/.test(l.trim())).length;
  const avgLength = body.reduce((sum, l) => sum + l.length, 0) / body.length;
  return unterminated / body.length >= 0.6 && avgLength >= 40;
}

/** Plain text → raw blocks. One block per paragraph; short lines stay separate. */
export function textToBlocks(input: string): RawResult {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\t/g, ' ');
  const chunks = text.split(/\n[ \t]*\n+/);
  const blocks: RawBlock[] = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((l) => l.replace(/\s+$/, '').replace(/^\s+/, ''))
      .filter((l) => l !== '');
    if (lines.length === 0) continue;
    if (lines.length > 1 && isHardWrapped(lines)) {
      blocks.push({ kind: 'paragraph', inlines: [{ text: lines.join(' ') }] });
    } else {
      for (const line of lines) blocks.push({ kind: 'paragraph', inlines: [{ text: line }] });
    }
  }
  return { blocks, warnings: [] };
}

/** Pasted text that uses Markdown headings or quotes is better parsed as Markdown. */
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s+\S/m.test(text) || /^>\s+\S/m.test(text);
}
