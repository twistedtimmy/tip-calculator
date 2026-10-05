import type { Inline } from '../model.js';

/**
 * What a parser produces before the structure heuristics run. `explicit` marks
 * blocks whose kind came from a real style in the source (a Word heading style,
 * a Markdown `#`, a Quote style) rather than from guessing.
 */
export interface RawBlock {
  kind: 'title' | 'heading' | 'paragraph' | 'blockquote' | 'reference';
  level?: number;
  inlines: Inline[];
  /** Only for blockquotes. */
  paragraphs?: Inline[][];
  explicit?: boolean;
}

export interface RawResult {
  blocks: RawBlock[];
  warnings: string[];
}
