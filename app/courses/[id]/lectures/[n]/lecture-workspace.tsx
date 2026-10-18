'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatPanel } from '@/components/chat-panel';
import { MaterialList } from '@/components/material-list';
import { NotesView } from '@/components/notes-view';
import { PasteBox } from '@/components/paste-box';
import { NOTES_SYSTEM } from '@/lib/prompts';
import { costUsd, estimateTokens, formatUsd } from '@/lib/tokens';
import type { Material, MaterialKind, Note } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  course: { id: string; code: string; name: string };
  lecture: { id: string | null; number: number; title: string | null };
  maxLecture: number;
  materials: Material[];
  notes: Note[];
}

const NOTES_MODEL = 'claude-sonnet-5-5';
const EST_OUTPUT_TOKENS = 5000;   // notes plus adaptive thinking; measured ~4.6k on a 1k-token transcript
const TABS: { kind: MaterialKind; label: string; placeholder: string; empty: string }[] = [
  { kind: 'transcript', label: 'Transcript', placeholder: 'Paste or type the lecture transcript…', empty: 'No transcript yet.' },
  { kind: 'handout', label: 'Handout', placeholder: 'Paste or type the handout pages for this lecture…', empty: 'No handout yet.' },
  { kind: 'notes', label: 'My notes', placeholder: 'Write or paste your own notes for this lecture…', empty: 'None of your own notes yet.' },
];

export function LectureWorkspace({ course, lecture, maxLecture, materials, notes }: Props) {
  const router = useRouter();
  const n = lecture.number;
  const [versionId, setVersionId] = useState<string | null>(null);   // null = latest
  const [gen, setGen] = useState<{ running: boolean; started?: number; error?: string }>({ running: false });
  const [elapsed, setElapsed] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(lecture.title ?? '');

  useEffect(() => {
    if (!gen.running) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - (gen.started ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(t);
  }, [gen.running, gen.started]);

  // Keyboard: g n next lecture, g p previous.
  useEffect(() => {
    let armed = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'g') { armed = Date.now(); return; }
      if (Date.now() - armed > 1200) return;
      armed = 0;
      if (e.key === 'n' && n < maxLecture) router.push(`/courses/${course.id}/lectures/${n + 1}`);
      if (e.key === 'p' && n > 1) router.push(`/courses/${course.id}/lectures/${n - 1}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, maxLecture, course.id, router]);

  const byKind = (k: MaterialKind) => materials.filter(m => m.kind === k);
  const hasTranscript = byKind('transcript').length > 0;
  const current = notes.find(x => x.id === versionId) ?? notes[0];
  // Open the handout tab once a transcript exists; fixed at mount so saving doesn't switch tabs under you.
  const [tab, setTab] = useState<string>(() => (hasTranscript ? 'handout' : 'transcript'));

  // Token count and estimated cost shown before "Generate notes".
  const estimate = useMemo(() => {
    const input = estimateTokens(NOTES_SYSTEM) + materials.reduce((s, m) => s + estimateTokens(m.content), 0) + 50;
    return { input, cost: costUsd(NOTES_MODEL, { input, output: EST_OUTPUT_TOKENS }) };
  }, [materials]);

  // A handout added after the latest notes is worth a regenerate.
  const handoutIsNewer = !!notes[0] && byKind('handout').some(h => h.created_at > notes[0].created_at);

  async function generate(force: boolean) {
    if (!lecture.id || gen.running) return;
    setGen({ running: true, started: Date.now() });
    setElapsed(0);
    const res = await fetch(`/api/lectures/${lecture.id}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGen({ running: false, error: data.error ?? 'Generation failed' });
      return;
    }
    setGen({ running: false });
    setVersionId(null);
    router.refresh();
  }

  async function saveTitle() {
    if (!lecture.id) return;
    await fetch(`/api/lectures/${lecture.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title || null }),
    });
    setEditingTitle(false);
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/courses/${course.id}`} className="text-xs text-muted-foreground hover:text-foreground">
            ← {course.code} · {course.name}
          </Link>
          {editingTitle ? (
            <form className="mt-1 flex gap-2" onSubmit={e => { e.preventDefault(); saveTitle(); }}>
              <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} className="h-8 w-80" />
              <Button size="sm" type="submit">Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setEditingTitle(false)}>Cancel</Button>
            </form>
          ) : (
            <h1 className="truncate text-xl font-semibold tracking-tight">
              Lecture {n}{lecture.title ? `: ${lecture.title}` : ''}
              {lecture.id && (
                <button className="ml-2 text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => setEditingTitle(true)}>
                  rename
                </button>
              )}
            </h1>
          )}
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link aria-disabled={n <= 1} href={`/courses/${course.id}/lectures/${Math.max(1, n - 1)}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), n <= 1 && 'pointer-events-none opacity-40')}>{n > 1 ? `← L${n - 1}` : '← Prev'}</Link>
          <Link aria-disabled={n >= maxLecture} href={`/courses/${course.id}/lectures/${n + 1}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), n >= maxLecture && 'pointer-events-none opacity-40')}>{n < maxLecture ? `L${n + 1} →` : 'Next →'}</Link>
          <span className="ml-2 hidden text-xs text-muted-foreground md:inline">
            <kbd className="rounded border px-1">g</kbd> <kbd className="rounded border px-1">n</kbd> / <kbd className="rounded border px-1">p</kbd>
          </span>
        </nav>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] xl:grid-cols-[360px_minmax(0,1fr)_380px]">
        {/* Left: paste boxes */}
        <section className="no-print min-w-0 space-y-3">
          <Tabs value={tab} onValueChange={v => setTab(String(v))}>
            <TabsList className="w-full">
              {TABS.map(t => (
                <TabsTrigger key={t.kind} value={t.kind}>
                  {t.label}
                  {byKind(t.kind).length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{byKind(t.kind).length}</Badge>}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map(t => (
              <TabsContent key={t.kind} value={t.kind} className="space-y-3 pt-2">
                <MaterialList items={byKind(t.kind).map(m => ({ ...m, preview: m.content.slice(0, 80) }))}
                  empty={t.empty} />
                <PasteBox courseId={course.id} lectureNumber={n} kind={t.kind} placeholder={t.placeholder} />
              </TabsContent>
            ))}
          </Tabs>
        </section>

        {/* Centre: generated notes */}
        <section className="print-full min-w-0 rounded-xl border bg-card p-4">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-xs text-muted-foreground">
              {hasTranscript
                ? <>≈{estimate.input.toLocaleString()} tokens in · est. {formatUsd(estimate.cost)} with Sonnet 5.5</>
                : 'Paste a transcript to generate notes.'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {notes.length > 1 && (
                <select aria-label="Notes version" value={current?.id} onChange={e => setVersionId(e.target.value === notes[0].id ? null : e.target.value)}
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-xs">
                  {notes.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      v{notes.length - i}{i === 0 ? ' (latest)' : ''} · {new Date(v.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              )}
              {current && <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>}
              {notes.length === 0 ? (
                <Button size="sm" onClick={() => generate(false)} disabled={!hasTranscript || !lecture.id || gen.running}>
                  {gen.running ? `Generating… ${elapsed}s` : 'Generate notes'}
                </Button>
              ) : (
                <Button size="sm" variant={handoutIsNewer ? 'default' : 'outline'} onClick={() => generate(true)}
                  disabled={!hasTranscript || gen.running}>
                  {gen.running ? `Generating… ${elapsed}s` : handoutIsNewer ? 'Regenerate with handout' : 'Regenerate'}
                </Button>
              )}
            </div>
          </div>
          {gen.error && <p className="mb-3 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{gen.error}</p>}
          {gen.running && !current && (
            <p className="animate-pulse text-sm text-muted-foreground">
              Claude is reading the transcript and writing notes. This usually takes 30–90 seconds.
            </p>
          )}
          {current ? (
            <NotesView markdown={current.markdown} examAlerts={current.exam_alerts ?? []} courseId={course.id} />
          ) : !gen.running && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {hasTranscript ? 'Ready — press “Generate notes”.' : 'No notes yet. Start by pasting the transcript on the left.'}
            </div>
          )}
        </section>

        {/* Right: lecture-scoped chat */}
        <ChatPanel courseId={course.id} lectureNumber={n}
          className="h-[70vh] lg:col-span-2 xl:sticky xl:top-4 xl:col-span-1 xl:h-[calc(100vh-6rem)]" />
      </div>
    </main>
  );
}
