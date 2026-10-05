import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePaper } from './model.js';
import { SUPPORTED_EXTENSIONS, parseDocument, parseText } from './parse/index.js';
import { renderDocx } from './render/docx.js';
import { renderHtml } from './render/html.js';
import { detectPdfEngine, renderPdf } from './render/pdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env['PORT'] ?? 3000);

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(root, 'public')));
app.use('/samples', express.static(path.join(root, 'samples')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '' || SUPPORTED_EXTENSIONS.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type "${ext}". Upload ${SUPPORTED_EXTENSIONS.join(', ')} — or export Google Docs as Word.`));
  },
});

/**
 * Header values must be Latin-1, so the plain filename is ASCII (diacritics
 * stripped) and the full Unicode name travels in the RFC 5987 filename* form.
 */
function contentDisposition(title: string, ext: string): string {
  const base = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'paper';
  const ascii = base.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/^-+|-+$/g, '') || 'paper';
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`;
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, pdf: await detectPdfEngine() });
});

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  const body = (req.body ?? {}) as { text?: string; filename?: string };
  const paper = req.file ? await parseDocument(req.file.buffer, req.file.originalname) : await parseText(String(body.text ?? ''), body.filename);
  res.json({ paper });
});

app.post('/api/render', async (req, res) => {
  const { paper: rawPaper, format } = (req.body ?? {}) as { paper?: unknown; format?: string };
  const paper = validatePaper(rawPaper);
  const title = paper.meta.title.trim() || 'paper';

  switch (format) {
    case 'html':
      res.type('html').send(renderHtml(paper, 'preview'));
      return;
    case 'docx': {
      const buffer = await renderDocx(paper);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', contentDisposition(title, 'docx'));
      res.send(buffer);
      return;
    }
    case 'pdf': {
      const buffer = await renderPdf(paper);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', contentDisposition(title, 'pdf'));
      res.send(buffer);
      return;
    }
    default:
      res.status(400).json({ error: 'format must be html, docx or pdf' });
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Something went wrong';
  const status = err instanceof multer.MulterError || /unsupported|no text|expected a paper|too large/i.test(message) ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  app.listen(PORT, () => {
    console.log(`APA Formatter running at http://localhost:${PORT}`);
  });
}
