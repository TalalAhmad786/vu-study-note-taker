import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import { notFound } from 'next/navigation';
import { pageCourse, pageUser } from '@/lib/auth';
import { lectureTiles } from '@/lib/course-data';
import { supabaseAdmin } from '@/lib/supabase';
import type { Material, Note } from '@/lib/types';
import { LectureWorkspace } from './lecture-workspace';

async function LecturePageBody({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const number = Number(n);
  if (!Number.isInteger(number) || number < 1 || number > 200) notFound();
  const user = await pageUser();
  const course = await pageCourse(id, user.id);
  const db = supabaseAdmin();

  const [{ data: lecture }, { max }] = await Promise.all([
    db.from('lectures').select('id, number, title').eq('course_id', id).eq('number', number).maybeSingle(),
    lectureTiles(id),
  ]);

  let materials: Material[] = [];
  let notes: Note[] = [];
  if (lecture) {
    const [m, nn] = await Promise.all([
      db.from('materials').select('*').eq('lecture_id', lecture.id).order('created_at'),
      db.from('notes').select('*').eq('lecture_id', lecture.id).order('created_at', { ascending: false }),
    ]);
    materials = (m.data ?? []) as Material[];
    notes = (nn.data ?? []) as Note[];
  }

  return (
    <LectureWorkspace
      key={`${id}:${number}`}
      course={{ id: course.id, code: course.code, name: course.name }}
      lecture={{ id: lecture?.id ?? null, number, title: lecture?.title ?? null }}
      maxLecture={max}
      materials={materials}
      notes={notes}
    />
  );
}

export default function LecturePage(props: { params: Promise<{ id: string; n: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading lecture" />}>
      <LecturePageBody {...props} />
    </Suspense>
  );
}
