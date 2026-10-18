import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAllowedEmail } from '@/lib/access';
import type { Course, Lecture } from '@/lib/types';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  // Every page and API route goes through here, so a session for a non-allowed email is ignored.
  return data.user && isAllowedEmail(data.user.email) ? data.user : null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, 'Not signed in');
  return user;
}

// For server components: redirect to /login instead of throwing.
export async function pageUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export async function pageCourse(courseId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) notFound();
  try {
    return await requireCourse(courseId, userId);
  } catch {
    notFound();
  }
}

export async function requireCourse(courseId: string, userId: string): Promise<Course> {
  const { data } = await supabaseAdmin()
    .from('courses').select('*').eq('id', courseId).eq('user_id', userId).maybeSingle();
  if (!data) throw new HttpError(404, 'Course not found');
  return data as Course;
}

export async function requireLecture(lectureId: string, userId: string): Promise<Lecture & { course: Course }> {
  const { data } = await supabaseAdmin()
    .from('lectures').select('id, course_id, number, title, course:courses!inner(*)')
    .eq('id', lectureId).eq('courses.user_id', userId).maybeSingle();
  if (!data) throw new HttpError(404, 'Lecture not found');
  return data as unknown as Lecture & { course: Course };
}

// Wraps a route handler so thrown HttpErrors / validation errors become JSON responses.
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        return NextResponse.json({ error: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
      }
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unexpected error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
