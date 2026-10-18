'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ACCEPT, extractFile } from '@/lib/extract';
import { ParserSelect, useParserMode } from '@/components/parser-select';
import { splitByLecture, type HandoutPart } from '@/lib/handout';
import { estimateTokens } from '@/lib/tokens';

// File → text in the browser (lib/extract) → optionally split on "Lecture N" headings →
// each part goes through /api/materials under its lecture number.
export function HandoutUpload({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'handout' | 'past_paper'>('handout');
  const [split, setSplit] = useState(true);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const parser = useParserMode();
  const [busy, setBusy] = useState(false);

  const parts: HandoutPart[] = !text ? [] : kind === 'handout' && split ? splitByLecture(text) : [{ lecture: null, text }];
  const lectureParts = parts.filter(p => p.lecture != null).length;

  async function onFile(f: File | null) {
    setFile(f);
    setText('');
    setError('');
    setWarnings([]);
    if (!f) return;
    setBusy(true);
    try {
      const { text: t, warnings: w } = await extractFile(f, setProgress, parser.mode);
      if (t.replace(/\[(Page|Slide) \d+\]/g, '').trim().length < 50) {
        setError('No readable text found in this file. Paste the text instead.');
      }
      setText(t);
      setWarnings(w);
      setProgress('');
      if (/past|paper|mid|final/i.test(f.name)) setKind('past_paper');
    } catch (e) {
      setProgress('');
      setError(e instanceof Error ? e.message : 'Could not read the file');
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setBusy(true);
    setError('');
    const base = file?.name.replace(/\.[a-z0-9]+$/i, '') ?? 'Handout';
    let done = 0;
    for (const p of parts) {
      setProgress(`Embedding part ${done + 1} of ${parts.length}${p.lecture ? ` (Lecture ${p.lecture})` : ''}…`);
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId, kind, content: p.text,
          lectureNumber: p.lecture ?? undefined,
          title: p.lecture ? `${base} — Lecture ${p.lecture}` : base,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(`Part ${done + 1} failed: ${d.error ?? res.statusText}. ${done} part(s) were saved.`);
        setBusy(false);
        router.refresh();
        return;
      }
      done++;
    }
    setProgress(`Saved ${done} part${done === 1 ? '' : 's'}.`);
    setFile(null);
    setText('');
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept={ACCEPT} disabled={busy}
          onChange={e => onFile(e.target.files?.[0] ?? null)}
          className="block min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm" />
        <ParserSelect {...parser} disabled={busy} />
      </div>
      {text && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Type</span>
              <select value={kind} onChange={e => setKind(e.target.value as 'handout' | 'past_paper')}
                className="h-7 rounded-md border border-input bg-transparent px-2">
                <option value="handout">Handout</option>
                <option value="past_paper">Past paper</option>
              </select>
            </label>
            {kind === 'handout' && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />
                Split on “Lecture N” headings
              </label>
            )}
          </div>
          <p className="text-muted-foreground">
            ≈{estimateTokens(text).toLocaleString()} tokens ·{' '}
            {kind === 'handout' && split
              ? lectureParts ? `${lectureParts} lecture sections found` : 'no lecture headings found — saved as one course-wide handout'
              : kind === 'past_paper' ? 'saved course-wide; Q&A, quizzes and revision weight it for exam prediction' : 'saved as one course-wide handout'}
          </p>
          {parts.length > 1 && (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {parts.map((p, i) => (
                <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {p.lecture ? `L${p.lecture}` : 'Intro'} · {p.text.length < 1000 ? p.text.length : `${(p.text.length / 1000).toFixed(1)}k`} chars
                </span>
              ))}
            </div>
          )}
          <Button size="sm" onClick={upload} disabled={busy || !parts.length}>Save {parts.length > 1 ? `${parts.length} parts` : ''}</Button>
        </div>
      )}
      {warnings.map(w => <p key={w} className="text-amber-700 dark:text-amber-400">{w}</p>)}
      {progress && <p className="text-muted-foreground">{progress}</p>}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
