import { NextResponse } from 'next/server';
import { HttpError, requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

// Deleting a material cascades to its chunks, so it also leaves Q&A retrieval.
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: mat } = await db.from('materials').select('course_id').eq('id', id).maybeSingle();
  if (!mat) throw new HttpError(404, 'Material not found');
  await requireCourse(mat.course_id, user.id);
  const { error } = await db.from('materials').delete().eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
