import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CANDIDATES = [
  process.env['SOFFICE_PATH'],
  'soffice',
  'libreoffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
].filter((c): c is string => !!c);

let lookup: Promise<string | null> | undefined;

function sofficeArgs(dir: string, outputExt: string, inputPath: string): string[] {
  const profile = `file://${path.join(dir, 'profile')}`;
  return [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nologo', '--convert-to', outputExt, '--outdir', dir, inputPath];
}

/**
 * A bare libreoffice-core install answers --version but has no Writer and
 * cannot load any document, so only a real conversion proves the binary works.
 */
async function canConvert(binary: string): Promise<boolean> {
  const dir = await mkdtemp(path.join(tmpdir(), 'apa-formatter-probe-'));
  try {
    const input = path.join(dir, 'probe.txt');
    await writeFile(input, 'probe\n');
    await execFileAsync(binary, sofficeArgs(dir, 'pdf', input), { timeout: 120_000 });
    await access(path.join(dir, 'probe.pdf'));
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Path to a LibreOffice binary that can really convert documents, or null. Cached after the first call. */
export function findLibreOffice(): Promise<string | null> {
  lookup ??= (async () => {
    for (const candidate of CANDIDATES) {
      try {
        await execFileAsync(candidate, ['--version'], { timeout: 30_000 });
      } catch {
        continue;
      }
      if (await canConvert(candidate)) return candidate;
    }
    return null;
  })();
  return lookup;
}

/**
 * Convert a document with LibreOffice in headless mode. Used for .doc/.odt/.rtf
 * uploads (→ docx) and for the PDF export (docx → pdf). Each run gets its own
 * profile directory so conversions can run in parallel.
 */
export async function convertWithLibreOffice(input: Buffer, inputExt: string, outputExt: 'docx' | 'pdf'): Promise<Buffer> {
  const soffice = await findLibreOffice();
  if (!soffice) throw new Error('LibreOffice is not installed on this server');

  const dir = await mkdtemp(path.join(tmpdir(), 'apa-formatter-'));
  try {
    const inputPath = path.join(dir, `input.${inputExt.replace(/^\./, '')}`);
    await writeFile(inputPath, input);
    const { stdout, stderr } = await execFileAsync(soffice, sofficeArgs(dir, outputExt, inputPath), { timeout: 180_000 });
    const outputPath = path.join(dir, `input.${outputExt}`);
    try {
      await access(outputPath);
    } catch {
      throw new Error(`LibreOffice could not convert the file: ${(stderr || stdout).trim() || 'no output was produced'}`);
    }
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
