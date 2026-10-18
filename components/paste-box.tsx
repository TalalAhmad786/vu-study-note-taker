'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MATERIAL_KINDS, type MaterialKind } from '@/lib/types';
import { estimateTokens } from '@/lib/tokens';
import { ACCEPT, ACCEPT_LABEL, extractFile } from '@/lib/extract';
import { ParserSelect, useParserMode } from '@/components/parser-select';

interface Props {
  courseId: string;
  lectureNumber?: number;
  kind?: MaterialKind;             // fixed kind (lecture tabs) …
  kinds?: MaterialKind[];          // … or a selector limited to these kinds
  placeholder?: string;
  onSaved?: (result: { chunks: number; lectureId: string | null }) => void;
}

const noopSubscribe = () => () => {};

// Write, paste or upload: a file's text is extracted in the browser into the textarea, so the
// student can check and edit it before saving. Kind selector and character/token counter.
// Autosaves to localStorage so a lost tab never loses a 10k-word transcript; submits to /api/materials.
export function PasteBox(props: Props) {
  const { courseId, lectureNumber, kind: fixedKind, kinds } = props;
  const [kind, setKind] = useState<MaterialKind>(fixedKind ?? kinds?.[0] ?? 'transcript');
  // The draft lives in localStorage, which only exists in the browser.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const storageKey = `vu-paste:${courseId}:${lectureNumber ?? 'course'}:${kind}`;
  if (!isClient) return <div className="min-h-72 animate-pulse rounded-lg bg-muted/40" />;
  return <Draft key={storageKey} {...props} kind={kind} selectable={!fixedKind && (kinds?.length ?? 0) > 1}
    onKindChange={setKind} storageKey={storageKey} />;
}

function readDraft(key: string): { content: string; title: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { content: saved?.content ?? '', title: saved?.title ?? '' };
  } catch {
    return { content: '', title: '' };
  }
}

function Draft({ courseId, lectureNumber, kind, kinds, placeholder, onSaved, storageKey, selectable, onKindChange }: Props & {
  kind: MaterialKind; selectable: boolean; onKindChange: (k: MaterialKind) => void; storageKey: string;
}) {
  const router = useRouter();
  const [initial] = useState(() => readDraft(storageKey));
  const [content, setContent] = useState(initial.content);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'ok' | 'error'; message?: string }>({ type: 'idle' });
  const [file, setFile] = useState<{ busy: boolean; message?: string; error?: string; warnings?: string[] }>({ busy: false });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const parser = useParserMode();

  useEffect(() => {
    try {
      if (content || title) localStorage.setItem(storageKey, JSON.stringify({ content, title }));
      else localStorage.removeItem(storageKey);
    } catch { /* storage full or blocked: autosave is best-effort */ }
  }, [content, title, storageKey]);

  async function submit() {
    setStatus({ type: 'saving' });
    const res = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, lectureNumber, kind, title: title || undefined, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ type: 'error', message: data.error ?? 'Save failed' });
      return;
    }
    setStatus({ type: 'ok', message: `Saved · ${data.chunks} chunk${data.chunks === 1 ? '' : 's'} embedded` });
    setContent('');
    setTitle('');
    setFile({ busy: false });
    onSaved?.(data);
    router.refresh();
  }

  async function loadFile(f: File | undefined) {
    if (!f || file.busy) return;
    setFile({ busy: true, message: `Reading ${f.name}…` });
    try {
      const { text, warnings } = await extractFile(f, message => setFile({ busy: true, message }), parser.mode);
      if (text.replace(/\[(Page|Slide) \d+\]/g, '').trim().length < 20) throw new Error(`No readable text found in ${f.name}.`);
      // Appending lets several files (e.g. part 1 and part 2 of a lecture) go into one material.
      setContent(c => (c.trim() ? `${c.trim()}\n\n${text}` : text));
      setTitle(t => t || f.name.replace(/\.[a-z0-9]+$/i, ''));
      setStatus({ type: 'idle' });
      setFile({ busy: false, message: `Loaded ${f.name}. Check the text below, then Save.`, warnings });
    } catch (e) {
      setFile({ busy: false, error: e instanceof Error ? e.message : `Could not read ${f.name}` });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const tokens = estimateTokens(content);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectable && (
          <select aria-label="Material kind" value={kind} onChange={e => onKindChange(e.target.value as MaterialKind)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            {MATERIAL_KINDS.filter(k => kinds!.includes(k.value)).map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        )}
        <Input className="h-8 flex-1 min-w-40" placeholder="Title (optional, e.g. Part 2 or Fall 2024 midterm)"
          value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={e => loadFile(e.target.files?.[0])} />
        <Button size="sm" variant="outline" className="h-7" disabled={file.busy} onClick={() => fileInput.current?.click()}>
          {file.busy ? 'Reading…' : 'Upload file'}
        </Button>
        <ParserSelect {...parser} disabled={file.busy} />
        <span className="min-w-0 flex-1">{file.busy ? file.message : `${ACCEPT_LABEL} — or drop it on the box, or paste / type below`}</span>
      </div>
      {!file.busy && file.message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{file.message}</p>}
      {file.warnings?.map(w => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
      {file.error && <p className="text-xs text-destructive">{file.error}</p>}
      <Textarea value={content}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); } }} onChange={e => { setContent(e.target.value); if (status.type !== 'saving') setStatus({ type: 'idle' }); }}
        placeholder={placeholder ?? 'Paste text here…'} className={`min-h-56 font-mono text-xs leading-relaxed ${dragging ? 'border-primary bg-primary/5' : ''}`} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{content.length.toLocaleString()} chars · ≈{tokens.toLocaleString()} tokens{content && ' · autosaved locally'}</span>
        <div className="flex items-center gap-3">
          {status.message && (
            <span className={status.type === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>{status.message}</span>
          )}
          <Button size="sm" onClick={submit} disabled={content.trim().length < 50 || status.type === 'saving'}>
            {status.type === 'saving' ? 'Embedding…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
