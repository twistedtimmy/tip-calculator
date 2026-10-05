# APA 7 Paper Formatter + Evidence Finder — Plan

Working title: **PaperFit** (placeholder). Draft for discussion, 2026-10-05.

## 1. What we're building

Drop a draft paper (and, ideally, your course readings) → get back a correctly formatted APA 7 student paper whose blanks are filled with real, verified quotes, each cited inline and listed on a References page → download as .docx or .pdf.

The product is really two halves with very different risk profiles:

| Half | What it does | Nature | Risk |
|---|---|---|---|
| **A. Formatter** | Turns any draft into APA 7 layout: title page, page numbers, double spacing, indents, headings, block quotes, References page with hanging indents, DOCX/PDF export | Deterministic, rule-based | Low — fully specifiable and testable |
| **B. Evidence Finder** | Detects blanks, understands the claim in context, finds real passages that support it, verifies them verbatim, writes them in with APA citations and reference entries | LLM + retrieval | High — must never invent a quote or a citation |

**Non-negotiable design rule for B: the model never writes a citation from memory.**
Every quote must be a verbatim substring of text we actually retrieved. Every reference entry is generated from structured metadata (DOI/ISBN lookup) by a citation processor, never typed by the LLM. Anything that fails verification is never shown to the user. Fabricated citations are the #1 way an app like this gets a student in trouble, so the architecture makes them impossible rather than unlikely.

Second rule: **the student approves every insertion.** The app proposes candidates per blank with the source passage visible; nothing is silently inserted. An "integrity report" lists every citation with its source, page, and verification status so the student (or an instructor) can check it.

## 2. User flow

1. **Drop zone 1 — your paper.** `.docx`, `.txt`, `.md`, `.pdf`, or paste text.
2. **Drop zone 2 — your sources (optional, strongly encouraged).** Class readings, textbook chapters, articles, lecture slides (`.pdf`, `.docx`, `.pptx`). These are searched first and quoted with page numbers. This is also where the app is strongest, because paywalled books and articles can't be searched any other way.
3. **Title page form.** Prefilled from the draft when the student typed name/course at the top. Fields: title, author(s), department + institution, course number and name, instructor, due date. Toggles: Student / Professional, running head, abstract, font.
4. **Analyze.** The draft becomes a structured document model. Blanks are found and classified. Existing in-text citations and any existing reference list are detected.
5. **Review panel.** Each blank shows 2–4 candidate passages: source, page, "verified verbatim" badge, and how well it supports the claim (supports / partially / weak). The student picks one, asks for a paraphrase instead, edits the wording, or dismisses the blank. The sentence is rewritten to integrate the quote grammatically.
6. **Live preview** of the formatted, paged paper.
7. **Export.** `.docx` (editable; APA paragraph styles baked in so it survives further editing in Word/Google Docs) and `.pdf`. Plus the integrity report.

## 3. APA 7 spec the formatter must implement

Student-paper defaults, with the professional variants as toggles. Source: APA Publication Manual, 7th ed., chapters 2, 8, 9, 10.

### 3.1 Page setup and text

| Element | Rule | Implementation note |
|---|---|---|
| Margins | 1 in. on all sides | Section page margins 1440 twips |
| Font | One accessible font throughout. Default **12-pt Times New Roman**; offer 11-pt Calibri, 11-pt Arial, 11-pt Georgia | Set in the document's Normal style so edits inherit it |
| Line spacing | **Double throughout** — title page, body, headings, block quotes, references. No extra space between paragraphs | line = 480 twips, space before/after = 0 |
| Alignment | Left-aligned, ragged right; no justification; no automatic hyphenation | |
| Paragraph indent | First line of every body paragraph indented **0.5 in.** | firstLine = 720 twips |
| Spacing after periods | One space | Normalize double spaces in the student's text |
| Page header | **Page number top right on every page, starting at 1 on the title page.** Student papers have nothing on the left. | Header with a PAGE field. |
| Running head | **Professional papers only** (or if the instructor requires it): abbreviated title in ALL CAPS, flush left in the header, ≤ 50 characters including spaces, same line as the page number | Toggle, off by default for student papers |
| Page order | Title page → Abstract (if any) → Text → References → (Tables, Figures, Appendices) | Each starts on a new page |

### 3.2 Title page (student)

All lines centered and double-spaced; page number 1 top right.

1. **Title** — bold, title case, placed 3–4 double-spaced lines below the top margin (upper half of the page). Long titles may wrap to two lines.
2. One blank double-spaced line.
3. **Author name(s)** — First M. Last; two authors joined with "and"; three or more with commas and "and" before the last.
4. **Affiliation** — department and institution, e.g., *Department of Psychology, Example University*.
5. **Course number and name** — as it appears in course materials, e.g., *PSY 201: Introduction to Psychology*.
6. **Instructor name** — as shown on course materials.
7. **Assignment due date** — *October 5, 2026*.

No blank lines between items 3–7. The professional variant replaces 5–7 with an author note and adds the running head.

### 3.3 Body

- Starts on a new page with the **title repeated**, bold, centered, title case. The introduction follows with no "Introduction" heading.
- **Headings** (all title case, no extra spacing around them):
  - Level 1: centered, bold. Text starts a new paragraph.
  - Level 2: flush left, bold.
  - Level 3: flush left, bold italic.
  - Level 4: indented 0.5 in., bold, ends with a period; text continues on the same line.
  - Level 5: indented 0.5 in., bold italic, ends with a period; text continues on the same line.
- **Short quotations (< 40 words)** run inside the sentence in double quotation marks. Parenthetical citation goes after the closing quotation mark and before the period: `… "quoted words" (Author, Year, p. 23).` If the author is named in the sentence, the year follows the name and the page follows the quote: `Author (Year) argued that "…" (p. 23).`
- **Block quotations (≥ 40 words)**: start on a new line, whole block indented 0.5 in. from the left, no quotation marks, double-spaced, citation in parentheses **after** the final punctuation. Subsequent paragraphs inside the block get an additional 0.5 in. first-line indent.
- **Abstract** (toggle, off by default for student papers): own page, label "Abstract" bold centered, single paragraph not indented, ≤ 250 words; optional italic *Keywords:* line indented 0.5 in.

### 3.4 In-text citations

Rendered by a citation processor (see §5), not by hand, so these rules hold everywhere:

| Case | Parenthetical | Narrative |
|---|---|---|
| One author | (Smith, 2020) | Smith (2020) |
| Two authors | (Smith & Jones, 2020) | Smith and Jones (2020) |
| Three or more | (Smith et al., 2020) — from the first citation | Smith et al. (2020) |
| Group author with abbreviation | (American Psychological Association [APA], 2020) first, then (APA, 2020) | |
| No author | Use the title, shortened: ("Title of Work," 2020); italic if a standalone work | |
| No date | (Smith, n.d.) | |
| Direct quote | **Page number required**: (Smith, 2020, p. 23) or (pp. 23–24). Unpaginated sources: paragraph number (para. 4), section heading, or heading + paragraph; timestamps for audio/video | |
| Paraphrase | (Smith, 2020); page numbers optional but encouraged | |
| Several works at once | Alphabetical, semicolon-separated: (Jones, 2018; Smith, 2020) | |
| Same author, same year | 2020a, 2020b (matching the reference list) | |
| Same surname, different first authors | Add initials: (J. M. Taylor, 2015; T. Taylor, 2017) | |
| Secondary source | (Rabbitt, 1982, as cited in Lyon et al., 2014); only Lyon et al. appears in References | |

Titles of works mentioned in running text are **title case** and italic (standalone works) or in quotation marks (parts of a greater whole) — the opposite of the sentence-case rule in the reference list. The "in the book ______" blank type must respect this.

### 3.5 Reference list

- New page; label **References** bold, centered.
- Double-spaced; **hanging indent 0.5 in.** on every entry.
- Alphabetical by first author's surname; same first author → by year; single-author entries before multi-author entries with the same first author.
- Authors as *Last, F. M.*; up to 20 authors with an ampersand before the last; 21+ authors: first 19, ellipsis, final author.
- Titles of articles, chapters, books and reports in **sentence case**; standalone works (books, reports, webpages, journal names) italic; article and chapter titles not italic.
- DOIs as `https://doi.org/…`; URLs plain; no "Retrieved from" unless the content is designed to change; no publisher location; no database names for commonly available works.
- Core shapes:
  - Journal: `Author, A. A., & Author, B. B. (Year). Title of article. *Journal Name, 12*(3), 45–67. https://doi.org/…`
  - Book: `Author, A. A. (Year). *Title of book* (2nd ed.). Publisher.`
  - Chapter in edited book: `Author, A. A. (Year). Title of chapter. In E. E. Editor (Ed.), *Title of book* (pp. 3–13). Publisher.`
  - Webpage: `Author or Group. (Year, Month Day). *Title of page*. Site Name. URL`
  - Lecture slides / class handout: `Instructor, A. A. (Year). *Title of slides* [PowerPoint slides]. Department, University. LMS URL`
- **Consistency check**: every in-text citation has an entry and every entry is cited (personal communications excepted). The app enforces this and flags violations.

## 4. Evidence Finder — how blank filling works

### 4.1 Blank detection and types

Detected patterns (configurable): `___` (3+ underscores), `[quote]`, `[cite]`, `[source]`, `[evidence]`, `[stat]`, `{{…}}`, and empty parentheses `( )` after a claim.

Each blank is classified from its sentence context:

| Type | Example | What gets inserted |
|---|---|---|
| `EVIDENCE` | "John Doe did this because ___" | A short verbatim quote (or a paraphrase on request) + (Author, Year, p. X) |
| `SOURCE` | "…published in the book ___" | A real work's title (italic, title case) and/or author, + (Year) |
| `CITE` | "Sleep loss impairs memory ( )." | Just a citation supporting the student's own sentence: (Author, Year) |
| `STAT` | "___% of undergraduates report…" | A number quoted verbatim from a source + citation |
| `DEFINE` | "Resilience is defined as ___" | A definitional quote + citation |

### 4.2 Pipeline per blank

1. **Build the context**: the sentence, its paragraph, the section heading, the paper's inferred thesis, and the blank type.
2. **Interpret the claim**: the LLM states what would make the sentence true and well supported, writes 3–5 search queries, and records constraints implied by the text ("a book", "a scientific study", a time period, a named person or theory).
3. **Retrieve candidates** from the source tiers in §4.3.
4. **Extract passages**: for each candidate with full text available, extract the verbatim passage(s) that best support the claim, with page location.
5. **Verify** (see §4.4). Rejects are dropped silently; nothing unverified reaches the UI.
6. **Judge support**: a separate check reads the passage *with its surrounding paragraph* and grades it supports / partially / weak / contradicts (a source describing a view it goes on to refute must not be quoted as endorsing it). Only supports/partially are shown, labeled.
7. **Resolve metadata** to CSL-JSON: DOI → CrossRef; ISBN → Open Library / Google Books; webpage → `citation_*` / Open Graph / schema.org meta tags; uploaded file → extracted from its first pages and confirmed by the student.
8. **Compose**: once the student picks a candidate, the LLM rewrites the sentence to integrate the quote with correct grammar and APA punctuation (narrative vs. parenthetical as fits the sentence), inserting a *structured* citation token rather than literal text. Block-quote layout is applied automatically at ≥ 40 words. The student can edit the result.
9. **Render**: citations and the References page are generated by the citation processor at export time, so et al. rules, ampersands, a/b suffixes, and alphabetization are always consistent.

Blanks are processed in parallel (bounded concurrency) with progress streamed to the UI; a paper with 8–10 blanks should finish in well under two minutes.

### 4.3 Source tiers (searched in this order)

**Tier A — the student's uploaded sources (best results).** Course readings, textbook chapters, articles, slides. Converted to PDF (slides and .docx via LibreOffice) so there is one ingestion path, with per-page text extracted. Uploaded once to the Claude Files API and referenced by `file_id` across every blank query, with prompt caching on the documents so repeated queries are cheap. Quotes come back with page locations via the API's citations feature (see §5.3). Printed page numbers are recovered from PDF page labels or by detecting the page-number offset in headers/footers; the student confirms the mapping once per file ("PDF page 1 is printed page 213 — correct?"). Slides use slide numbers as locators.

**Tier B — open scholarly literature.**
- **OpenAlex** (free): keyword search, authorships, year, venue, volume/issue/pages, DOI, and `best_oa_location` for an open-access PDF. Nearly everything needed for a reference entry.
- **CrossRef**: authoritative CSL-JSON by DOI — this is what the reference entry is built from.
- **Semantic Scholar**: better relevance search and `openAccessPdf`; fallback for OpenAlex.
- **Unpaywall / CORE / Europe PMC / arXiv**: locate and fetch open-access full text so passages can be extracted and verified.
- When only an abstract is available: offer a **paraphrase citation** (no page number needed in APA), clearly labeled "abstract only". Never a "quote" from text we haven't seen.

**Tier C — books.**
- **Open Library "search inside"** (Internet Archive full-text): returns real snippets with page numbers for many scanned books, including in-copyright ones. Snippets are short but verifiable.
- **Google Books API**: metadata (authors, year, publisher, ISBN) and tiny snippets; mainly for resolving the `SOURCE` blank type and building the reference entry.
- **Project Gutenberg / Internet Archive**: full text for public-domain works.
- For an in-copyright book with no snippet access the app can cite it generally (paraphrase) but **cannot quote it**, and says so: "I can't see inside this book. Upload the chapter to quote it directly."

Optional Tier B shortcut for v1: Claude's server-side `web_search` + `web_fetch` tools restricted to scholarly / open-access domains, with fetch citations enabled. Simpler than integrating six APIs, but DOIs and structured metadata still need CrossRef/OpenAlex, so the API tier is the long-term answer.

### 4.4 Verification gate

Every candidate quote must pass all of:

1. **Verbatim check** — after normalizing whitespace, quotation marks, dashes, ligatures and hyphenation at line breaks, the quote is an exact substring of the retrieved source text. Run against our own extracted text even when the API already returned cited text (defense in depth).
2. **Locator present** — a page number (or paragraph/slide/section locator) is attached; a quote without a locator is downgraded to a paraphrase suggestion.
3. **Metadata resolved** — the source resolves to a CSL-JSON item with at least author (or group), year (or n.d.), title, and container/publisher. Unresolved sources are shown to the student as "needs details" and never exported as a half-formed reference.
4. **Support judged** — supports or partially supports, with the surrounding paragraph considered.

Failing any check → the candidate is discarded. The integrity report shows each accepted quote's checks.

### 4.5 What the app deliberately does not do

- It does not invent reasons, arguments, or facts to fill `EVIDENCE` blanks; it fills them only with sourced evidence. The student writes the argument.
- It does not rewrite the student's prose outside the blanks (beyond mechanical formatting), unless asked.
- It does not insert anything without the student's approval.

## 5. Architecture and stack

Recommendation: **TypeScript end to end**, because the strongest libraries for both halves are JavaScript (`docx` for Word output, `citeproc-js` for APA rendering, `pdfjs-dist` for page-level PDF text).

### 5.1 Components

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js (App Router) + React + TypeScript + Tailwind**; `react-dropzone` | Drop zones, review panel, live preview, route handlers for the API in one codebase |
| Draft ingestion | `mammoth` (.docx → HTML with heading style map), `pdfjs-dist` (per-page text), markdown parser for .md | Preserves headings/italics from Word; page-level text gives locators |
| Source ingestion | LibreOffice headless (`.docx`/`.pptx` → PDF), `pdfjs-dist` for text and page labels | One ingestion path for every source type |
| Citation rendering | **`citeproc-js` + official `apa.csl` + en-US locale**, items as CSL-JSON | Handles et al., ampersands, disambiguation (2020a/b), initials, alphabetization — the whole of §3.4–3.5 deterministically |
| Metadata | CrossRef (CSL-JSON by DOI), OpenAlex, Semantic Scholar, Open Library, Google Books, Unpaywall | §4.3 |
| LLM | **Anthropic SDK (`@anthropic-ai/sdk`), model `claude-opus-5-5`** | §5.3 |
| DOCX export | `docx` (npm) | Full control of styles, header fields, section breaks, indents |
| PDF export | **LibreOffice headless** converting the generated .docx (packaged via Gotenberg or in the app's Docker image) | Pixel-faithful to the .docx; browser printing can't do reliable header page numbers |
| Preview | Server renders the same document model to paged HTML | Fast feedback; the PDF remains the source of truth |
| Jobs / progress | In-process queue + Server-Sent Events in v1; BullMQ + Redis if we scale out | Per-blank progress streaming |
| Storage | **None persistent in v1**: uploads live in a temp dir keyed by session and are deleted after export | Student papers and copyrighted readings shouldn't be retained |
| Hosting | One Docker image (Node + LibreOffice) on Fly.io / Railway / Render | Vercel can't run LibreOffice |

### 5.2 Document model (sketch)

```ts
type Paper = {
  meta: TitlePage;              // title, authors[], affiliation, course, instructor, dueDate, runningHead?
  options: FormatOptions;       // paperType: 'student' | 'professional', font, includeAbstract, includeRunningHead
  abstract?: string;
  blocks: Block[];              // ordered body content
  items: Record<string, CslItem>;   // CSL-JSON sources, keyed by id — the References page is derived from these
};

type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'blockquote'; inlines: Inline[]; citation: CitationRef };

type Inline =
  | { type: 'text'; text: string; italic?: boolean; bold?: boolean }
  | { type: 'citation'; ref: CitationRef }                       // rendered by citeproc at export
  | { type: 'quote'; text: string; evidenceId: string }           // verified verbatim span
  | { type: 'blank'; id: string; kind: BlankKind; raw: string };  // unresolved

type CitationRef = {
  itemId: string;
  locator?: string;                       // "23", "23–24", "4"
  label?: 'page' | 'paragraph' | 'section';
  form: 'parenthetical' | 'narrative';
};

type Evidence = {
  id: string; itemId: string;
  quote: string; sourceParagraph: string; locator: string;
  verification: 'verbatim' | 'failed';
  support: 'supports' | 'partial' | 'weak' | 'contradicts';
  retrievedFrom: 'upload' | 'openalex' | 'crossref' | 'openlibrary' | 'gutenberg' | 'web';
  url?: string;
};
```

Everything — preview, DOCX, PDF, integrity report — is rendered from `Paper`. The student's text is never round-tripped through a lossy format.

### 5.3 How Claude is used

| Step | Request shape | Notes |
|---|---|---|
| Parse a messy draft into blocks; pull title-page fields out of a typed header | Structured output (`output_config.format`) | Low effort |
| Classify blanks; infer the claim; write search queries | Structured output | Medium effort |
| Extract verbatim passages from uploaded sources | Document blocks (Files API `file_id`) with **`citations: {enabled: true}`**; `cache_control` on the documents | Returns `cited_text` with 1-indexed `page_location` straight from the document — verbatim by construction. High effort |
| Judge support with surrounding context | Structured output | Separate call: citations and structured output can't be combined in one request |
| Rewrite the sentence around the chosen quote | Structured output (sentence + citation token) | Medium effort |
| Parse pasted reference entries → CSL-JSON; convert titles to sentence case preserving proper nouns | Structured output | Low effort |

Details that matter:
- **Prompt caching** makes "put the whole textbook in context" economical: documents go first and stay byte-identical across calls; the per-blank question comes last. A 300-page textbook (~200k tokens) costs on the order of a dollar to cache once, then a few cents per blank query at current cache-read pricing.
- **Limits**: 32 MB per request and 600 pages per PDF document — textbooks over 600 pages get split by chapter at upload.
- Adaptive thinking is on by default on this model; use `output_config.effort` per step as above. Enable server-side refusal fallbacks (`fallbacks: "default"`) so an occasional classifier refusal degrades gracefully.
- Stream long calls; show per-blank progress.
- Rough cost: **$0.50–$2 per paper** at current list prices depending on how much source material is uploaded. Rate-limit per session and cap uploads (25 MB/file, 600 pages).

## 6. Export details

### 6.1 DOCX (`docx` npm)

- Define real Word styles so the file stays APA-correct when the student keeps editing: `Normal` (font, 12 pt, double spacing, 0 pt before/after), `Heading 1–5` mapped to APA levels, `Block Quote` (left indent 720 twips), `Reference Entry` (left 720, hanging 720), `Title` (bold, centered).
- Header on every section: page number via a `PAGE` field, right-aligned; optional running head on the left via a tab stop on the same line.
- Title page: empty paragraphs to position the title 3–4 lines down; centered items per §3.2.
- Body first page: title repeated (bold, centered); paragraphs `firstLine: 720`.
- References: `pageBreakBefore` on the label; entries from citeproc's HTML output converted to runs (italics preserved).
- Set core properties (title, author). Left alignment; no hyphenation; widow/orphan control on.

### 6.2 PDF

Generated .docx → LibreOffice headless → PDF. Fonts installed in the image: Liberation Serif/Sans (metric-compatible with Times New Roman/Arial) plus Calibri-compatible Carlito, so page breaks match Word closely.

### 6.3 Integrity report

A short appendix-style page (separate file, not part of the paper): every citation, its source, locator, verification status, retrieval origin and URL/DOI. Also exportable as JSON.

## 7. Milestones

Sized S/M/L; each ships something usable.

**M0 — Spec and golden fixtures (S).** Encode §3 as an automated checklist: tests unzip the generated .docx and assert margins, spacing, header field, indents, hanging indents, page break before References, title-page order. Compare rendered PDF pages (via `pdftoppm`) against the APA's published student sample paper. citeproc unit tests against the APA style blog's reference examples.

**M1 — Formatter MVP (M).** Upload .docx/.txt/.md/paste → parse → title-page form → live preview → .docx and .pdf export with everything in §3 except citation rewriting. No AI needed. Useful on its own and the foundation for everything else.

**M2 — Citation normalization (M).** Detect existing in-text citations (APA, MLA-style, numeric) and reference entries; resolve them via CrossRef/OpenAlex to authoritative metadata; re-render with citeproc; enforce citation ↔ reference consistency; flag anything unresolved for the student rather than silently reformatting it.

**M3 — Evidence from uploaded sources (L).** Sources drop zone; conversion to PDF; page-label detection; Files API upload with caching; blank detection and typing; passage extraction with citations; verification gate; support judgment; review panel; sentence composition; integrity report. This is the core of the product.

**M4 — Open-literature search (L).** OpenAlex / CrossRef / Semantic Scholar / Unpaywall / Open Library integration; open-access PDF fetching; the same gate; honest "can't see inside this book" fallbacks and paraphrase-only suggestions.

**M5 — Polish and hardening (M).** Professional format and running head, abstract, heading-level editor, multi-author title pages, accessibility, error states, rate limiting and cost caps, privacy policy and terms (uploads not retained), optional accounts with a saved personal source library, evaluation set for the evidence finder (precision of support judgments; fabricated references must be zero by construction).

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fabricated quotes or references | Verification gate (§4.4); reference entries only from structured metadata via citeproc; nothing unverified is shown or exported |
| Quote technically verbatim but misrepresents the source | Support judgment reads the surrounding paragraph; "contradicts" is filtered out; the student sees the source paragraph in the review panel |
| Paywalled books and articles can't be searched | Uploaded course readings are Tier A; Open Library snippets for books; paraphrase-only suggestions from abstracts; clear messaging about what the app can't see |
| Wrong page numbers (PDF index vs. printed page) | PDF page labels, header/footer offset detection, one-time confirmation per file; paragraph/slide locators where pages don't exist |
| Mangled student prose when splicing quotes | Composition step rewrites only the target sentence; student edits before accepting; original is kept for undo |
| Messy input (Google Docs exports, PDFs, odd headings) | Heading heuristics + the LLM parse step; the preview makes misparses visible immediately; manual heading-level editor in M5 |
| Reference titles arrive in Title Case from publishers | Sentence-case normalization step with proper-noun preservation before citeproc |
| Cost and latency with large textbooks | Prompt caching, per-blank parallelism, chapter splitting, per-session caps |
| Privacy of papers and copyrighted readings | No retention by default; temp storage deleted after export; keys server-side only |
| Academic-integrity policies vary by school | The app formats and finds evidence; the student approves every insertion; the integrity report makes everything checkable. Include a short, visible note about checking course policy on AI assistance |

## 9. Open questions

1. **Platform** — web app only (assumed), or also desktop?
2. **Audience** — personal tool, your school, or a public product? Drives accounts, billing, privacy work, and how hard to lean on the integrity report.
3. **Scope of generation** — the plan assumes blanks are filled *only* with sourced evidence (quotes/paraphrases + citations), never with the app's own reasoning. Confirm.
4. **Instructor variants** — default font; whether to ship the running-head and abstract toggles in M1 or M5.
5. **Language/stack** — TypeScript/Next.js assumed for the reasons in §5. Any preference otherwise?
6. **Hosting and retention** — single Docker image on Fly.io/Railway/Render (LibreOffice needs a container); zero retention of uploads by default. OK?
7. **Repo** — this plan is sitting in the `tip-calculator` repo. Start a fresh repository for the new app?
