import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import Link from 'next/link';
import { pageCourse, pageUser } from '@/lib/auth';
import { lectureTiles } from '@/lib/course-data';
import { lecturesWithNotes } from '@/lib/notes-range';
import { supabaseAdmin } from '@/lib/supabase';
import { RevisionClient } from './revision-client';

async function RevisionPageBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const course = await pageCourse(id, user.id);
  const [{ max }, ready, { data: sheets }] = await Promise.all([
    lectureTiles(id),
    lecturesWithNotes(id),
    supabaseAdmin().from('materials').select('id, title, content, created_at')
      .eq('course_id', id).eq('kind', 'notes').is('lecture_id', null).like('title', 'Revision:%')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="no-print">
        <Link href={`/courses/${id}`} className="text-xs text-muted-foreground hover:text-foreground">← {course.code} · {course.name}</Link>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Revision sheet</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {ready.length
            ? `Every exam alert grouped by topic, every definition, formula and the likely long questions. Notes ready for lectures: ${ready.join(', ')}.`
            : 'Generate notes for some lectures first — revision sheets are built from notes.'}
        </p>
      </div>
      <RevisionClient courseId={id} max={max} defaultFrom={ready[0] ?? 1} defaultTo={ready.at(-1) ?? 1}
        sheets={(sheets ?? []).map(s => ({ id: s.id, title: s.title, markdown: s.content, created_at: s.created_at }))} />
    </main>
  );
}

export default function RevisionPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading revision sheets" />}>
      <RevisionPageBody {...props} />
    </Suspense>
  );
}
