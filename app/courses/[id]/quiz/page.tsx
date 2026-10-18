import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import Link from 'next/link';
import { pageCourse, pageUser } from '@/lib/auth';
import { lectureTiles } from '@/lib/course-data';
import { lecturesWithNotes } from '@/lib/notes-range';
import { QuizRunner } from './quiz-runner';

async function QuizPageBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const course = await pageCourse(id, user.id);
  const [{ max }, ready] = await Promise.all([lectureTiles(id), lecturesWithNotes(id)]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Link href={`/courses/${id}`} className="text-xs text-muted-foreground hover:text-foreground">← {course.code} · {course.name}</Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Quiz</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {ready.length
          ? `Questions come from your notes and exam alerts. Notes ready for lectures: ${ready.join(', ')}.`
          : 'Generate notes for a few lectures first — quizzes are built from notes and exam alerts.'}
      </p>
      <QuizRunner courseId={id} max={max} defaultFrom={ready[0] ?? 1} defaultTo={ready.at(-1) ?? 1} />
    </main>
  );
}

export default function QuizPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading quiz" />}>
      <QuizPageBody {...props} />
    </Suspense>
  );
}
