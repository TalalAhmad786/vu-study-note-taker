import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NewCourseDialog } from '@/components/new-course-dialog';
import { pageUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { formatUsd } from '@/lib/tokens';

async function HomeBody() {
  const user = await pageUser();
  const db = supabaseAdmin();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [{ data: courses }, { data: usage }] = await Promise.all([
    db.from('courses').select('id, code, name, instructor, lectures(id, materials(id), notes(id))')
      .eq('user_id', user.id).order('created_at'),
    db.from('usage_log').select('cost_usd, created_at').eq('user_id', user.id),
  ]);

  const total = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
  const month = (usage ?? []).filter(u => u.created_at >= monthStart).reduce((s, u) => s + Number(u.cost_usd), 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API spend: <strong className="text-foreground">{formatUsd(month)}</strong> this month · {formatUsd(total)} all time
          </p>
        </div>
        <NewCourseDialog />
      </div>

      {!courses?.length ? (
        <div className="mt-10 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No courses yet. Create one, then paste a lecture transcript to get exam-focused notes.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(c => {
            const lectures = (c.lectures ?? []).filter(l => l.materials?.length || l.notes?.length);
            const ready = lectures.filter(l => l.notes?.length).length;
            return (
              <Link key={c.id} href={`/courses/${c.id}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-muted/40">
                  <CardHeader>
                    <CardDescription className="font-mono text-xs">{c.code}</CardDescription>
                    <CardTitle>{c.name}</CardTitle>
                    {c.instructor && <CardDescription>{c.instructor}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex gap-4 text-sm">
                    <span><strong>{lectures.length}</strong> <span className="text-muted-foreground">lectures</span></span>
                    <span><strong className="text-emerald-600 dark:text-emerald-400">{ready}</strong> <span className="text-muted-foreground">notes ready</span></span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageLoading label="Loading courses" />}>
      <HomeBody  />
    </Suspense>
  );
}
