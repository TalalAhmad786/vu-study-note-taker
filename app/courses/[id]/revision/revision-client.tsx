'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/markdown';
import { RangePicker } from '@/components/range-picker';

interface Sheet { id: string; title: string; markdown: string; created_at: string }

export function RevisionClient({ courseId, max, defaultFrom, defaultTo, sheets }: {
  courseId: string; max: number; defaultFrom: number; defaultTo: number; sheets: Sheet[];
}) {
  const router = useRouter();
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });
  const [current, setCurrent] = useState<Sheet | null>(sheets[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    const res = await fetch(`/api/courses/${courseId}/revision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(range),
    });
    clearInterval(timer);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Could not build the revision sheet');
    setCurrent({ id: data.id, title: data.title, markdown: data.markdown, created_at: data.created_at });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <RangePicker max={max} from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} disabled={busy} />
        <Button onClick={generate} disabled={busy}>{busy ? `Generating… ${elapsed}s` : 'Generate'}</Button>
        {current && <Button variant="outline" onClick={() => window.print()}>Print</Button>}
        {sheets.length > 0 && (
          <select aria-label="Saved sheets" value={current?.id ?? ''} className="ml-auto h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            onChange={e => setCurrent(sheets.find(s => s.id === e.target.value) ?? null)}>
            {sheets.map(s => <option key={s.id} value={s.id}>{s.title} · {new Date(s.created_at).toLocaleDateString()}</option>)}
          </select>
        )}
      </div>
      {error && <p className="no-print text-sm text-destructive">{error}</p>}
      {busy && <p className="no-print animate-pulse text-sm text-muted-foreground">Sonnet is reading your notes and grouping the exam alerts by topic…</p>}
      {current ? (
        <article className="rounded-xl border bg-card p-6 print:border-0 print:p-0">
          <Markdown courseId={courseId}>{current.markdown}</Markdown>
        </article>
      ) : !busy && (
        <p className="py-12 text-center text-sm text-muted-foreground">Choose a lecture range and press Generate.</p>
      )}
    </div>
  );
}
