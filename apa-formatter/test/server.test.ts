import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultOptions, emptyMeta, type Paper } from '../src/model.js';
import { app } from '../src/server.js';

let server: Server;
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const paper: Paper = {
  meta: { ...emptyMeta(), title: 'Čeština a spánek', authors: 'Jana Nováková' },
  options: defaultOptions(),
  blocks: [{ type: 'paragraph', inlines: [{ text: 'Text.' }] }],
  warnings: [],
};

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('API', () => {
  it('downloads a .docx whose title is outside Latin-1', async () => {
    const res = await post('/api/render', { paper, format: 'docx' });
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('filename="Cestina-a-spanek.docx"');
    expect(disposition).toContain("filename*=UTF-8''%C4%8Ce%C5%A1tina-a-sp%C3%A1nek.docx");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it('analyzes pasted text', async () => {
    const res = await post('/api/analyze', { text: 'My Title\nJordan Rivera\n\nA paragraph of body text that is long enough to count as the paper itself for this test.' });
    expect(res.status).toBe(200);
    const { paper: parsed } = (await res.json()) as { paper: Paper };
    expect(parsed.meta.title).toBe('My Title');
    expect(parsed.meta.authors).toBe('Jordan Rivera');
    expect(parsed.blocks).toHaveLength(1);
  });

  it('answers bad input with a 400 and a message', async () => {
    const empty = await post('/api/analyze', { text: '   ' });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toMatch(/no text/i);

    const form = new FormData();
    form.append('file', new Blob(['nope']), 'paper.pages');
    const upload = await fetch(`${base}/api/analyze`, { method: 'POST', body: form });
    expect(upload.status).toBe(400);
    expect(((await upload.json()) as { error: string }).error).toMatch(/Unsupported file type/);

    const format = await post('/api/render', { paper, format: 'odt' });
    expect(format.status).toBe(400);
  });
});
