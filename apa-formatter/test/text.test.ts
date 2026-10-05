import { describe, expect, it } from 'vitest';
import { fixPageRanges, fixReferenceDashes, formatDueDate, looksLikeDate, makeRunningHead, normalizeSpacing, toTitleCase } from '../src/apa/text.js';

describe('toTitleCase', () => {
  it('capitalizes major words and lowercases short minor words', () => {
    expect(toTitleCase('the effects of sleep on memory in college students')).toBe('The Effects of Sleep on Memory in College Students');
  });
  it('capitalizes the first word after a colon and the last word', () => {
    expect(toTitleCase('sleep and memory: a review of the evidence')).toBe('Sleep and Memory: A Review of the Evidence');
    expect(toTitleCase('what we fight for')).toBe('What We Fight For');
  });
  it('keeps acronyms, internal capitals and hyphenated compounds', () => {
    expect(toTitleCase('COVID-19 and the iPhone generation: long-term self-esteem')).toBe('COVID-19 and the iPhone Generation: Long-Term Self-Esteem');
  });
  it('recovers from ALL CAPS while keeping likely acronyms', () => {
    expect(toTitleCase('WHY WE SLEEP')).toBe('Why We Sleep');
    expect(toTitleCase('DNA REPAIR MECHANISMS')).toBe('DNA Repair Mechanisms');
    expect(toTitleCase('COVID-19 AND THE FBI')).toBe('COVID-19 and the FBI');
  });
  it('capitalizes prepositions of four letters or more', () => {
    expect(toTitleCase('learning from mistakes between classes')).toBe('Learning From Mistakes Between Classes');
  });
});

describe('spacing and dashes', () => {
  it('collapses double spaces after periods', () => {
    expect(normalizeSpacing('One.  Two.   Three .')).toBe('One. Two. Three.');
  });
  it('uses an en dash in page ranges', () => {
    expect(fixPageRanges('(Smith, 2020, pp. 23-24)')).toBe('(Smith, 2020, pp. 23–24)');
    expect(fixPageRanges('(Smith, 2020, p. 23)')).toBe('(Smith, 2020, p. 23)');
  });
  it('fixes numeric ranges in references but leaves DOIs and URLs alone', () => {
    const entry = 'Journal, 14(3), 211-229. https://doi.org/10.0000/jsc.2019-14-3';
    expect(fixReferenceDashes(entry)).toBe('Journal, 14(3), 211–229. https://doi.org/10.0000/jsc.2019-14-3');
  });
  it('leaves report numbers, ISBNs and other identifiers alone', () => {
    expect(fixReferenceDashes('(NCES 2020-009)')).toBe('(NCES 2020-009)');
    expect(fixReferenceDashes('ISBN 978-0-13-468599-1')).toBe('ISBN 978-0-13-468599-1');
    expect(fixReferenceDashes('Sleep, 39(3), 687-698.')).toBe('Sleep, 39(3), 687–698.');
  });
});

describe('running head', () => {
  it('uppercases and cuts at a word boundary under 50 characters', () => {
    const head = makeRunningHead('Sleep Deprivation and Working Memory in College Students Today');
    expect(head).toBe('SLEEP DEPRIVATION AND WORKING MEMORY IN COLLEGE');
    expect(head.length).toBeLessThanOrEqual(50);
  });
});

describe('dates', () => {
  it('normalizes common date formats to Month Day, Year', () => {
    expect(formatDueDate('10/5/2026')).toBe('October 5, 2026');
    expect(formatDueDate('Oct 5, 2026')).toBe('October 5, 2026');
    expect(formatDueDate('5 October 2026')).toBe('October 5, 2026');
    expect(formatDueDate('2026-10-05')).toBe('October 5, 2026');
    expect(formatDueDate('Due: October 5th, 2026')).toBe('October 5, 2026');
    expect(formatDueDate('Due date: October 5, 2026')).toBe('October 5, 2026');
  });
  it('leaves unknown wording alone', () => {
    expect(formatDueDate('Fall semester 2026')).toBe('Fall semester 2026');
  });
  it('recognises date-like lines', () => {
    expect(looksLikeDate('October 5, 2026')).toBe(true);
    expect(looksLikeDate('Professor Marsh')).toBe(false);
  });
});
