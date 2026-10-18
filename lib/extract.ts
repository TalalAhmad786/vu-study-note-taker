'use client';

// Turns an uploaded file into plain text in the browser. Files never leave the machine; only the
// extracted text is sent to /api/materials (after the student has had a chance to review it).
//
//   .pdf               pdf.js text layer, rebuilt into lines; pages with no text layer are OCR'd
//   .docx              mammoth → HTML → markdown-ish text (keeps headings, lists, tables)
//   .pptx              slide text + speaker notes, one [Slide N] block per slide
//   .srt / .vtt        subtitle cues → paragraphs (YouTube auto-captions de-duplicated)
//   .txt / .md         as-is
//   .png / .jpg / .webp  OCR (tesseract.js)

export type Progress = (message: string) => void;

// 'quick' = the in-browser parsers below. 'docling' = the local Docling service via /api/parse
// (real tables, multi-column reading order, better OCR); 'docling-math' also turns formulas into LaTeX.
export type ParserMode = 'quick' | 'docling' | 'docling-math';
const DOCLING_EXTS = new Set(['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg', 'webp']);
export const doclingCanRead = (name: string) => DOCLING_EXTS.has(ext(name));

let doclingCheck: Promise<boolean> | null = null;
// Asked once per page load; restart the page after starting `npm run parser`.
export function doclingAvailable() {
  doclingCheck ??= fetch('/api/parse').then(r => r.json()).then(d => !!d.available).catch(() => false);
  return doclingCheck;
}

export interface Extracted {
  text: string;
  warnings: string[];
}

export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.srt,.vtt,.png,.jpg,.jpeg,.webp';
export const ACCEPT_LABEL = 'PDF, Word, PowerPoint, TXT, subtitles (SRT/VTT) or an image';

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

export async function extractFile(file: File, onProgress: Progress = () => {}, mode: ParserMode = 'quick'): Promise<Extracted> {
  if (mode !== 'quick' && doclingCanRead(file.name)) return extractDocling(file, mode === 'docling-math', onProgress);
  switch (ext(file.name)) {
    case 'pdf': return extractPdf(file, onProgress);
    case 'docx': return { text: await extractDocx(file), warnings: [] };
    case 'pptx': return { text: await extractPptx(file), warnings: [] };
    case 'srt':
    case 'vtt': return { text: subtitlesToText(await file.text()), warnings: [] };
    case 'txt':
    case 'md': return { text: (await file.text()).replace(/\r\n?/g, '\n').trim(), warnings: [] };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp': {
      const text = await ocr([file], onProgress);
      return { text: text[0], warnings: ['Text came from OCR — check names, numbers and code carefully.'] };
    }
    case 'doc':
    case 'ppt':
      throw new Error(`Old .${ext(file.name)} files can't be read in the browser. Save it as .${ext(file.name)}x or PDF and upload that.`);
    default:
      throw new Error(`Unsupported file type. Upload ${ACCEPT_LABEL}.`);
  }
}

// ───────────────────────── Docling ─────────────────────────

async function extractDocling(file: File, formulas: boolean, onProgress: Progress): Promise<Extracted> {
  const started = Date.now();
  const tick = () => onProgress(`Docling is parsing ${file.name}… ${Math.round((Date.now() - started) / 1000)}s` +
    (formulas ? ' (maths on CPU can take a few minutes)' : ''));
  tick();
  const timer = setInterval(tick, 1000);
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('formulas', String(formulas));
    const res = await fetch('/api/parse', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Docling could not parse this file');
    const warnings = formulas
      ? ['Formulas were converted to LaTeX — compare a few with the original before saving. Formulas written inside a sentence are often garbled.']
      : data.formulasSkipped
        ? [`${data.formulasSkipped} formula${data.formulasSkipped === 1 ? ' was' : 's were'} skipped and marked [formula]. Choose “Docling + maths” to read them, or type them in.`]
        : [];
    return { text: data.text, warnings };
  } finally {
    clearInterval(timer);
  }
}

// ───────────────────────── PDF ─────────────────────────

const MIN_PAGE_CHARS = 25;   // below this a page is treated as scanned

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs;
}

async function extractPdf(file: File, onProgress: Progress): Promise<Extracted> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress(`Reading page ${i} of ${doc.numPages}…`);
    const page = await doc.getPage(i);
    pages.push(pageText((await page.getTextContent()).items));
  }

  // Scanned pages have no text layer: render them and OCR.
  const warnings: string[] = [];
  const scanned = pages.flatMap((t, i) => (t.length < MIN_PAGE_CHARS ? [i + 1] : []));
  if (scanned.length) {
    const images: HTMLCanvasElement[] = [];
    for (const n of scanned) {
      onProgress(`Rendering scanned page ${n}…`);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });   // ~150 dpi: good accuracy, reasonable speed
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      images.push(canvas);
    }
    const texts = await ocr(images, onProgress);
    scanned.forEach((n, i) => { pages[n - 1] = texts[i]; });
    warnings.push(scanned.length === pages.length
      ? 'This PDF is scanned, so all text came from OCR — check names, numbers and code carefully.'
      : `Pages ${compactRanges(scanned)} were scanned and read with OCR — check them carefully.`);
  }

  // Page markers let the notes cite "Handout p.X".
  return { text: pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join('\n\n'), warnings };
}

interface PdfItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

// pdf.js returns positioned text runs. Group runs into lines by baseline, order them left to right,
// and insert spaces only where there is a visible gap, so words split across runs stay whole.
function pageText(items: unknown[]): string {
  const runs = (items as PdfItem[]).filter(it => typeof it.str === 'string' && it.str.length > 0);
  const lines: { y: number; size: number; runs: PdfItem[] }[] = [];
  for (const r of runs) {
    const y = r.transform[5];
    const size = Math.abs(r.transform[3]) || r.height || 10;
    const line = lines.find(l => Math.abs(l.y - y) < Math.min(l.size, size) * 0.5);
    if (line) line.runs.push(r);
    else lines.push({ y, size, runs: [r] });
  }
  lines.sort((a, b) => b.y - a.y);

  const out: string[] = [];
  let prev: { y: number; size: number } | null = null;
  for (const line of lines) {
    line.runs.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let end = -Infinity;
    for (const r of line.runs) {
      const x = r.transform[4];
      if (text && x - end > line.size * 0.15 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' ';
      text += r.str;
      end = x + r.width;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // A gap bigger than ~1.5 lines starts a new paragraph.
    if (prev && prev.y - line.y > Math.max(prev.size, line.size) * 1.8) out.push('');
    out.push(text);
    prev = line;
  }
  return out.join('\n').trim();
}

function compactRanges(ns: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    parts.push(i === j ? `${ns[i]}` : `${ns[i]}–${ns[j]}`);
    i = j;
  }
  return parts.join(', ');
}

// ───────────────────────── OCR ─────────────────────────

// tesseract.js downloads its engine and English model (~15 MB) on first use, then the browser caches them.
async function ocr(images: (Blob | HTMLCanvasElement)[], onProgress: Progress): Promise<string[]> {
  const { createWorker } = await import('tesseract.js');
  onProgress('Loading OCR engine (first time only downloads ~15 MB)…');
  let current = 0;
  const worker = await createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        onProgress(`OCR page ${current + 1} of ${images.length}: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  try {
    const out: string[] = [];
    for (; current < images.length; current++) {
      const { data } = await worker.recognize(images[current]);
      out.push(data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

// ───────────────────────── Word ─────────────────────────

async function extractDocx(file: File) {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToText(html);
}

// Keeps the structure Claude benefits from: headings, bullet/numbered lists and tables.
function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const inline = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  const list = (el: Element, depth: number) => {
    const ordered = el.tagName.toLowerCase() === 'ol';
    Array.from(el.children).forEach((li, i) => {
      const own = li.cloneNode(true) as Element;
      own.querySelectorAll('ul, ol').forEach(n => n.remove());
      out.push(`${'  '.repeat(depth)}${ordered ? `${i + 1}.` : '-'} ${inline(own)}`);
      Array.from(li.children).filter(c => /^(ul|ol)$/i.test(c.tagName)).forEach(n => list(n, depth + 1));
    });
  };

  const walk = (el: Element) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        out.push('', `${'#'.repeat(Number(tag[1]))} ${inline(node)}`, '');
      } else if (tag === 'p') {
        const t = inline(node);
        if (t) out.push(t, '');
      } else if (tag === 'ul' || tag === 'ol') {
        list(node, 0);
        out.push('');
      } else if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('th, td')).map(c => inline(c).replace(/\|/g, '\\|')));
        if (rows.length) {
          out.push(`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => ' --- ').join('|')}|`);
          rows.slice(1).forEach(r => out.push(`| ${r.join(' | ')} |`));
          out.push('');
        }
      } else {
        walk(node);
      }
    }
  };
  walk(doc.body);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ───────────────────────── PowerPoint ─────────────────────────

async function extractPptx(file: File) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = async (path: string) => {
    const f = zip.file(path);
    return f ? new DOMParser().parseFromString(await f.async('text'), 'application/xml') : null;
  };
  // Paragraph by paragraph, so bullet points stay on their own lines.
  const paragraphs = (doc: Document | null) =>
    doc ? Array.from(doc.getElementsByTagName('a:p'))
      .map(p => Array.from(p.getElementsByTagName('a:t')).map(t => t.textContent ?? '').join('').trim())
      .filter(Boolean) : [];

  const slides = Object.keys(zip.files)
    .map(p => p.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);

  const blocks: string[] = [];
  for (const n of slides) {
    const body = paragraphs(await xml(`ppt/slides/slide${n}.xml`));
    // Speaker notes are linked through the slide's relationships file.
    const rels = await xml(`ppt/slides/_rels/slide${n}.xml.rels`);
    const notesTarget = rels && Array.from(rels.getElementsByTagName('Relationship'))
      .find(r => (r.getAttribute('Type') ?? '').endsWith('/notesSlide'))?.getAttribute('Target');
    const notes = notesTarget
      ? paragraphs(await xml(`ppt/notesSlides/${notesTarget.split('/').pop()}`)).filter(t => !/^\d+$/.test(t))
      : [];
    if (!body.length && !notes.length) continue;
    blocks.push([`[Slide ${n}]`, ...body, ...(notes.length ? ['Speaker notes:', ...notes] : [])].join('\n'));
  }
  return blocks.join('\n\n');
}

// ───────────────────────── Subtitles ─────────────────────────

// SRT/VTT → readable paragraphs. YouTube auto-captions repeat each line in the next cue (rolling
// captions), so consecutive duplicates are dropped; a pause of 3s+ starts a new paragraph.
export function subtitlesToText(raw: string) {
  const time = (s: string) => {
    const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
  };
  const cues = raw.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const paragraphs: string[][] = [[]];
  let lastEnd = 0;
  let lastLine = '';
  for (const cue of cues) {
    const lines = cue.split('\n');
    const timing = lines.findIndex(l => l.includes('-->'));
    if (timing === -1) continue;   // WEBVTT header, NOTE and STYLE blocks
    const [start, end] = lines[timing].split('-->').map(time);
    if (start - lastEnd >= 3 && paragraphs.at(-1)!.length) paragraphs.push([]);
    lastEnd = end;
    for (const l of lines.slice(timing + 1)) {
      const text = l.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      if (!text || text === lastLine || /^\[(music|applause)\]$/i.test(text)) continue;
      paragraphs.at(-1)!.push(text);
      lastLine = text;
    }
  }
  return paragraphs.map(p => p.join(' ')).filter(Boolean).join('\n\n');
}
