// APA Formatter front end: upload → edit title page/options/structure → preview → download.

const $ = (sel) => document.querySelector(sel);

const state = { paper: null, pdfEngine: null, previewTimer: null, previewRequest: 0 };

const el = {
  intake: $('#intake'),
  workspace: $('#workspace'),
  dropzone: $('#dropzone'),
  fileInput: $('#file-input'),
  pasteInput: $('#paste-input'),
  pasteSubmit: $('#paste-submit'),
  sampleBtn: $('#sample-btn'),
  intakeStatus: $('#intake-status'),
  workStatus: $('#work-status'),
  structure: $('#structure'),
  notesPanel: $('#notes-panel'),
  notes: $('#notes'),
  preview: $('#preview'),
  dlDocx: $('#dl-docx'),
  dlPdf: $('#dl-pdf'),
  restart: $('#restart'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(node, message, kind = '') {
  if (!message) {
    node.hidden = true;
    node.textContent = '';
    node.className = 'status';
    return;
  }
  node.hidden = false;
  node.textContent = message;
  node.className = `status ${kind}`.trim();
}

async function readError(response) {
  try {
    const data = await response.json();
    return data.error || response.statusText;
  } catch {
    return response.statusText || 'Request failed';
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, key) => (o[key] ??= {}), obj);
  target[last] = value;
}

function blockInlines(block) {
  if (block.type === 'blockquote') {
    return block.paragraphs.flatMap((p, i) => (i ? [{ text: ' ' }, ...p] : p));
  }
  return block.inlines;
}

function blockSnippet(block) {
  const text = blockInlines(block).map((i) => i.text).join('').trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function blockKind(block) {
  return block.type === 'heading' ? `heading${block.level}` : block.type;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

async function analyze(formData, isJson = false) {
  el.dropzone.classList.add('busy');
  setStatus(el.intakeStatus, 'Reading your paper…');
  try {
    const response = await fetch('/api/analyze', isJson
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) }
      : { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await readError(response));
    const { paper } = await response.json();
    openWorkspace(paper);
    setStatus(el.intakeStatus, '');
  } catch (err) {
    setStatus(el.intakeStatus, err.message || 'Could not read that file.', 'error');
  } finally {
    el.dropzone.classList.remove('busy');
  }
}

function analyzeFile(file) {
  if (!file) return;
  const data = new FormData();
  data.append('file', file, file.name);
  analyze(data);
}

el.dropzone.addEventListener('click', () => el.fileInput.click());
el.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    el.fileInput.click();
  }
});
el.fileInput.addEventListener('change', () => {
  analyzeFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});
for (const type of ['dragenter', 'dragover']) {
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.add('drag');
  });
}
for (const type of ['dragleave', 'drop']) {
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('drag');
  });
}
el.dropzone.addEventListener('drop', (e) => analyzeFile(e.dataTransfer.files[0]));
// Dropping anywhere on the intake screen should work too.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!el.intake.hidden && e.dataTransfer.files[0] && !el.dropzone.contains(e.target)) analyzeFile(e.dataTransfer.files[0]);
});

el.pasteSubmit.addEventListener('click', () => {
  const text = el.pasteInput.value;
  if (!text.trim()) {
    setStatus(el.intakeStatus, 'Paste some text first.', 'error');
    return;
  }
  analyze({ text, filename: 'pasted-paper.txt' }, true);
});

el.sampleBtn.addEventListener('click', async () => {
  setStatus(el.intakeStatus, 'Loading the sample…');
  const response = await fetch('/samples/sample-draft.txt');
  analyze({ text: await response.text(), filename: 'sample-draft.txt' }, true);
});

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

function openWorkspace(paper) {
  state.paper = paper;
  el.intake.hidden = true;
  el.workspace.hidden = false;
  fillForm();
  renderStructure();
  renderNotes();
  schedulePreview(0);
  window.scrollTo({ top: 0 });
}

function fillForm() {
  for (const input of el.workspace.querySelectorAll('[data-field]')) {
    const value = getPath(state.paper, input.dataset.field);
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'radio') input.checked = input.value === value;
    else input.value = value ?? '';
  }
  updateConditionalFields();
}

function updateConditionalFields() {
  const { options } = state.paper;
  const professional = options.paperType === 'professional';
  for (const node of el.workspace.querySelectorAll('[data-student-only]')) node.hidden = professional;
  for (const node of el.workspace.querySelectorAll('[data-professional-only]')) node.hidden = !professional;
  for (const node of el.workspace.querySelectorAll('[data-running-head-only]')) node.hidden = !(options.includeRunningHead || professional);
  for (const node of el.workspace.querySelectorAll('[data-abstract-only]')) node.hidden = !options.includeAbstract;
}

el.workspace.addEventListener('input', (e) => {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  let value;
  if (input.type === 'checkbox') value = input.checked;
  else if (input.type === 'radio') value = input.value;
  else value = input.value;
  setPath(state.paper, input.dataset.field, value);
  updateConditionalFields();
  schedulePreview(350);
});

function renderStructure() {
  const { blocks } = state.paper;
  el.structure.innerHTML = '';
  if (!blocks.length) {
    el.structure.innerHTML = '<li class="empty">No body text was found.</li>';
    return;
  }
  const kinds = [
    ['paragraph', 'Paragraph'],
    ['heading1', 'Heading 1'],
    ['heading2', 'Heading 2'],
    ['heading3', 'Heading 3'],
    ['heading4', 'Heading 4'],
    ['heading5', 'Heading 5'],
    ['blockquote', 'Block quote'],
    ['reference', 'Reference'],
  ];
  blocks.forEach((block, index) => {
    const li = document.createElement('li');
    li.className = `is-${block.type}`;
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Block type');
    for (const [value, label] of kinds) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === blockKind(block);
      select.append(option);
    }
    select.addEventListener('change', () => changeBlockType(index, select.value));
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.title = blockInlines(block).map((i) => i.text).join('');
    snippet.textContent = blockSnippet(block);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.title = 'Remove this block';
    del.setAttribute('aria-label', 'Remove this block');
    del.textContent = '×';
    del.addEventListener('click', () => {
      state.paper.blocks.splice(index, 1);
      renderStructure();
      schedulePreview(0);
    });
    li.append(select, snippet, del);
    el.structure.append(li);
  });
}

function changeBlockType(index, kind) {
  const block = state.paper.blocks[index];
  const inlines = blockInlines(block);
  let next;
  if (kind === 'paragraph') next = { type: 'paragraph', inlines };
  else if (kind.startsWith('heading')) next = { type: 'heading', level: Number(kind.slice(7)), inlines };
  else if (kind === 'blockquote') next = { type: 'blockquote', paragraphs: [inlines] };
  else next = { type: 'reference', inlines };
  state.paper.blocks[index] = next;
  renderStructure();
  schedulePreview(0);
}

function renderNotes() {
  const notes = state.paper.warnings || [];
  el.notesPanel.hidden = notes.length === 0;
  el.notes.innerHTML = '';
  for (const note of notes) {
    const li = document.createElement('li');
    li.textContent = note;
    el.notes.append(li);
  }
}

// ---------------------------------------------------------------------------
// Preview and downloads
// ---------------------------------------------------------------------------

function schedulePreview(delay) {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(refreshPreview, delay);
}

async function refreshPreview() {
  const requestId = ++state.previewRequest;
  try {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper: state.paper, format: 'html' }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const html = await response.text();
    if (requestId === state.previewRequest) el.preview.srcdoc = html;
    setStatus(el.workStatus, '');
  } catch (err) {
    setStatus(el.workStatus, `Preview failed: ${err.message}`, 'error');
  }
}

async function download(format) {
  const button = format === 'docx' ? el.dlDocx : el.dlPdf;
  button.disabled = true;
  setStatus(el.workStatus, format === 'pdf' ? 'Building your PDF… this takes a few seconds.' : 'Building your Word file…');
  try {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper: state.paper, format }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match ? match[1] : `paper.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setStatus(el.workStatus, `Your .${format} is downloading.`, 'ok');
    setTimeout(() => setStatus(el.workStatus, ''), 4000);
  } catch (err) {
    setStatus(el.workStatus, err.message || 'Download failed.', 'error');
  } finally {
    button.disabled = false;
  }
}

el.dlDocx.addEventListener('click', () => download('docx'));
el.dlPdf.addEventListener('click', () => download('pdf'));
el.restart.addEventListener('click', () => {
  state.paper = null;
  el.workspace.hidden = true;
  el.intake.hidden = false;
  el.preview.srcdoc = '';
  setStatus(el.workStatus, '');
  window.scrollTo({ top: 0 });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

fetch('/api/health')
  .then((r) => r.json())
  .then((health) => {
    state.pdfEngine = health.pdf;
    if (!health.pdf) {
      el.dlPdf.disabled = true;
      el.dlPdf.title = 'PDF export needs LibreOffice or Chromium on the server. Download the .docx and export to PDF from Word.';
    }
  })
  .catch(() => {});
