import { marked } from 'marked';
import { htmlToBlocks } from './html.js';
import type { RawResult } from './raw.js';

export async function markdownToBlocks(markdown: string): Promise<RawResult> {
  const html = await marked.parse(markdown.replace(/^﻿/, ''), { gfm: true, breaks: false });
  return htmlToBlocks(html);
}
