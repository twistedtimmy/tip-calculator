# APA Formatter

Drop in a school paper, get it back formatted to the APA *Publication Manual* (7th edition) student-paper guidelines, as a Word file or a PDF.

A web app: Node + TypeScript on the server, plain HTML/CSS/JS in the browser, no build step.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, restarts on changes
npm start          # same, without the watcher
```

Optional on the server:

- **LibreOffice** (`soffice` on the PATH, or `SOFFICE_PATH=/path/to/soffice`) — converts the generated `.docx` to PDF so the PDF matches the Word file page for page, and lets the app accept `.doc`, `.odt` and `.rtf` uploads.
- **Chromium / Chrome** — fallback PDF engine when LibreOffice is missing (set `CHROME_PATH` if it isn't in a standard place).

Without either, the `.docx` download still works and the PDF button explains what's missing.

```bash
npm test           # unit tests: parsing, DOCX XML, HTML, PDF page order
npm run typecheck
npm run demo -- samples/sample-draft.txt out/   # format a file from the command line
```

## What it does

Takes `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`, `.md` or pasted text, and applies:

| APA 7 rule | What the app does |
|---|---|
| 1-inch margins, left-aligned, no hyphenation | Page setup in the `.docx`; CSS in the preview/PDF fallback |
| Accessible font, consistent throughout | Times New Roman 12 by default; Calibri 11, Arial 11 or Georgia 11 on request |
| Double-spaced everywhere, no extra space between paragraphs | Default paragraph style; blank lines in the source are dropped |
| Page number top right on every page from the title page on | Header with a `PAGE` field |
| No running head on student papers; required on professional papers | Off by default; toggle for instructors who want it; always on for professional. Uppercased, ≤ 50 characters |
| Student title page: bold title in the upper half, blank line, author, affiliation, course, instructor, due date — centered, double-spaced | Fields are prefilled from the lines a student typed at the top of their draft and can be edited |
| Body starts on a new page with the title repeated, bold and centered | Automatic |
| No "Introduction" heading | Removed when present |
| Heading levels 1–3 (centered bold / flush-left bold / flush-left bold italic), levels 4–5 run into the paragraph with a period | Word heading styles are honoured; otherwise short bold or unterminated lines above a paragraph are detected as Level 1. Levels can be changed in the Structure panel |
| Title and headings in title case | Toggle, on by default |
| Paragraphs indented 0.5 in. on the first line | Automatic |
| Quotations of 40+ words as block quotations: indented 0.5 in., no quotation marks, citation after the final period | A whole paragraph inside quotation marks is converted automatically; Word *Quote* styles and Markdown `>` are honoured |
| One space after periods; en dash in page ranges | Text clean-up |
| References on a new page, label centered and bold, entries double-spaced with a 0.5 in. hanging indent, alphabetized | Everything under a "References" / "Works Cited" / "Bibliography" heading becomes an entry (one per paragraph). Alphabetizing is a toggle |
| Optional abstract page with keywords line | Toggle; an "Abstract" section in the draft is picked up automatically |

The Word file defines real paragraph styles (Normal, Heading 1–3, Block Quote, Reference Entry), so it stays APA-correct if the student keeps editing in Word or Google Docs.

## Tips for the input

- Put your name, course, instructor and due date on their own lines at the top. Labels like `Course: PSY 201` also work.
- Give the reference list a heading ("References") and put one entry per paragraph. Italics you've already applied are kept.
- A quotation of 40 words or more that fills a whole paragraph is turned into a block quotation; keep its citation in parentheses right after it.
- From Google Docs: File → Download → Microsoft Word (.docx).

## What it does not do (yet)

- It doesn't check or rewrite citations and reference entries — it formats what you wrote. Italics inside reference entries only survive when they were already in the source (`.docx`/`.md`), not in plain text.
- Tables, figures, footnotes and appendices are left out and reported in the Notes panel.
- No accounts, no storage: documents are processed in memory and discarded.

## How it's put together

```
src/
  model.ts            the Paper document model, validation of papers sent back by the browser
  apa/text.ts         title case, running head, date and dash rules
  parse/              .docx (mammoth) / Markdown (marked) / plain text → raw blocks → structure.ts heuristics → Paper
  render/prepare.ts   shared resolution of title, running head, run-in headings, sorted references
  render/html.ts      preview (paper sheets) and print layout
  render/docx.ts      Word output via the `docx` library
  render/pdf.ts       LibreOffice docx→pdf, Chromium fallback
  server.ts           Express: /api/analyze, /api/render, /api/health
public/               the single-page UI
samples/              a fictional sample paper to try
test/                 vitest suites
```
