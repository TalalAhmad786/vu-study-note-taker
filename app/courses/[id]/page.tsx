import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddLectureDialog } from '@/components/add-lecture-dialog';
import { ChatPanel } from '@/components/chat-panel';
import { DeleteCourseButton } from '@/components/delete-course-button';
import { HandoutUpload } from '@/components/handout-upload';
import { LectureGrid } from '@/components/lecture-grid';
import { MaterialList, type MaterialSummary } from '@/components/material-list';
import { PasteBox } from '@/components/paste-box';
import { pageCourse, pageUser } from '@/lib/auth';
import { lectureTiles } from '@/lib/course-data';
import { supabaseAdmin } from '@/lib/supabase';

async function CoursePageBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const course = await pageCourse(id, user.id);

  const [{ tiles, max, lastUsed }, { data: wide }] = await Promise.all([
    lectureTiles(id),
    supabaseAdmin().from('materials').select('id, kind, title, token_count, created_at, content')
      .eq('course_id', id).is('lecture_id', null).order('created_at', { ascending: false }),
  ]);
  const courseWide: MaterialSummary[] = (wide ?? []).map(({ content, ...m }) => ({ ...m, preview: content.slice(0, 80) }));

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_400px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Courses</Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="mr-2 font-mono text-lg text-muted-foreground">{course.code}</span>{course.name}
            </h1>
            {course.instructor && <p className="text-sm text-muted-foreground">{course.instructor}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/courses/${id}/quiz`} className={buttonVariants({ variant: 'outline' })}>Quiz</Link>
            <Link href={`/courses/${id}/revision`} className={buttonVariants({ variant: 'outline' })}>Revision sheet</Link>
            <AddLectureDialog courseId={id} nextNumber={Math.min(lastUsed + 1, 200)} />
            <DeleteCourseButton courseId={id} name={course.code} />
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Lectures</CardTitle></CardHeader>
          <CardContent><LectureGrid courseId={id} tiles={tiles} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Handouts and past papers</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="pdf">
              <TabsList>
                <TabsTrigger value="pdf">Upload file</TabsTrigger>
                <TabsTrigger value="paste">Paste text</TabsTrigger>
              </TabsList>
              <TabsContent value="pdf" className="pt-3"><HandoutUpload courseId={id} /></TabsContent>
              <TabsContent value="paste" className="pt-3">
                <PasteBox courseId={id} kinds={['past_paper', 'handout', 'notes']}
                  placeholder="Paste a past paper, a course-wide handout or your own notes…" />
              </TabsContent>
            </Tabs>
            <MaterialList items={courseWide} empty="No course-wide material yet. Lecture handouts split by heading appear on each lecture page." />
          </CardContent>
        </Card>
      </div>

      <ChatPanel courseId={id} maxLecture={max} className="h-[calc(100vh-7rem)] lg:sticky lg:top-4" />
    </main>
  );
}

export default function CoursePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading course" />}>
      <CoursePageBody {...props} />
    </Suspense>
  );
}
