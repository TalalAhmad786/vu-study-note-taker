import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  number: z.number().int().min(1).max(200),
  title: z.string().trim().max(300).optional(),
});

// Add (or rename) a lecture by number.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireCourse(id, user.id);
  const body = Body.parse(await req.json());
  const row: Record<string, unknown> = { course_id: id, number: body.number };
  if (body.title) row.title = body.title;
  const { data, error } = await supabaseAdmin().from('lectures')
    .upsert(row, { onConflict: 'course_id,number' }).select('id, number').single();
  if (error) throw error;
  return NextResponse.json(data);
});
