'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LectureStatus } from '@/lib/types';

export interface GridTile {
  number: number;
  title: string | null;
  status: LectureStatus;
}

const DOT: Record<LectureStatus, string> = {
  empty: 'bg-muted-foreground/25',
  material: 'bg-sky-500',
  transcript: 'bg-amber-500',
  notes: 'bg-emerald-500',
};

const LABEL: Record<LectureStatus, string> = {
  empty: 'No material',
  material: 'Handout / notes only',
  transcript: 'Transcript added',
  notes: 'Notes ready',
};

// Lecture tiles 1–45 (or more), keyboard navigable with the arrow keys.
export function LectureGrid({ courseId, tiles }: { courseId: string; tiles: GridTile[] }) {
  const grid = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const links = Array.from(grid.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    // Column count = tiles sharing the first row's offsetTop.
    const cols = links.filter(l => l.offsetTop === links[0].offsetTop).length || 1;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    links[Math.min(links.length - 1, Math.max(0, i + delta))]?.focus();
  }

  return (
    <div>
      <div ref={grid} onKeyDown={onKeyDown} className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
        {tiles.map(t => (
          <Link key={t.number} href={`/courses/${courseId}/lectures/${t.number}`}
            title={`Lecture ${t.number}${t.title ? `: ${t.title}` : ''} — ${LABEL[t.status]}`}
            className={cn(
              'relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors',
              'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              t.status === 'empty' && 'text-muted-foreground',
            )}>
            {t.number}
            <span className={cn('absolute right-1.5 top-1.5 size-1.5 rounded-full', DOT[t.status])} />
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(LABEL) as LectureStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', DOT[s])} />{LABEL[s]}</span>
        ))}
      </div>
    </div>
  );
}
