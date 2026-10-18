'use client';

import { useRef } from 'react';
import { Markdown } from '@/components/markdown';
import type { ExamAlert } from '@/lib/types';

// Notes markdown with a sticky "Exam alerts" card; each alert jumps to its spot in the notes.
export function NotesView({ markdown, examAlerts, courseId }: { markdown: string; examAlerts: ExamAlert[]; courseId: string }) {
  const body = useRef<HTMLDivElement>(null);

  function jump(alert: ExamAlert) {
    const root = body.current;
    if (!root) return;
    const probe = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
    const needles = [probe(alert.quote), probe(alert.point)].filter(n => n.length > 8);
    const section = root.querySelector('#exam-alerts');
    const candidates = Array.from(root.querySelectorAll('li, p'));
    // Prefer matches inside the Exam alerts section, then anywhere in the notes.
    const inSection = section ? candidates.filter(el => section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
    const find = (els: Element[]) => els.find(el => {
      const t = (el.textContent ?? '').toLowerCase().replace(/\s+/g, ' ');
      return needles.some(n => t.includes(n));
    });
    const target = find(inSection) ?? find(candidates) ?? section;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('flash');
    void (target as HTMLElement).offsetWidth;
    target.classList.add('flash');
  }

  return (
    <div className="space-y-4">
      {examAlerts.length > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-amber-300/60 bg-amber-50/95 p-3 shadow-sm backdrop-blur dark:border-amber-500/30 dark:bg-amber-950/80 print:static print:shadow-none">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Exam alerts</h3>
            <span className="text-xs text-amber-800/70 dark:text-amber-300/70">{examAlerts.length} flagged by the instructor</span>
          </div>
          <ol className="max-h-56 list-decimal space-y-1 overflow-y-auto pl-5 text-sm text-amber-950 dark:text-amber-100 print:max-h-none">
            {examAlerts.map((a, i) => (
              <li key={i}>
                <button type="button" onClick={() => jump(a)} className="text-left align-top hover:underline">
                  {a.point}
                  {a.handout_ref && <span className="ml-1 text-xs text-amber-800/80 dark:text-amber-300/80">(Handout {a.handout_ref})</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div ref={body}>
        <Markdown courseId={courseId}>{markdown}</Markdown>
      </div>
    </div>
  );
}
