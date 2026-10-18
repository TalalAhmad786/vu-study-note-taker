import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { chunkText } from '@/lib/chunk';
import { EMBED_MODEL, embedMany } from '@/lib/embed';
import { estimateTokens } from '@/lib/tokens';
import { logUsage } from '@/lib/usage';

const Body = z.object({
  courseId: z.string().uuid(),
  lectureNumber: z.number().int().min(1).max(200).optional(),   // omit for course-wide handouts
  kind: z.enum(['transcript', 'handout', 'notes', 'past_paper']),
  title: z.string().max(300).optional(),
  content: z.string().trim().min(50, 'Paste at least 50 characters'),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  await requireCourse(body.courseId, user.id);
  const db = supabaseAdmin();

  let lectureId: string | null = null;
  if (body.lectureNumber) {
    const { data, error } = await db.from('lectures')
      .upsert({ course_id: body.courseId, number: body.lectureNumber }, { onConflict: 'course_id,number' })
      .select('id').single();
    if (error) throw error;
    lectureId = data.id;
  }

  // Embed before inserting anything so a Voyage failure leaves no half-saved material behind.
  const header = `[${body.kind.toUpperCase()}${body.lectureNumber ? ` · Lecture ${body.lectureNumber}` : ''}${body.title ? ` · ${body.title}` : ''}]`;
  const pieces = chunkText(body.content, header);
  const { vectors, tokens } = await embedMany(pieces, 'document');

  const { data: mat, error: matErr } = await db.from('materials').insert({
    course_id: body.courseId, lecture_id: lectureId, kind: body.kind,
    title: body.title || null, content: body.content, token_count: estimateTokens(body.content),
  }).select('id').single();
  if (matErr) throw matErr;

  const rows = pieces.map((content, i) => ({
    material_id: mat.id, course_id: body.courseId, lecture_id: lectureId,
    kind: body.kind, position: i, content, embedding: vectors[i],
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('chunks').insert(rows.slice(i, i + 200));
    if (error) {
      await db.from('materials').delete().eq('id', mat.id);
      throw error;
    }
  }

  await logUsage({ userId: user.id, courseId: body.courseId, operation: 'embed', model: EMBED_MODEL, input: tokens });
  return NextResponse.json({ materialId: mat.id, lectureId, chunks: pieces.length });
});
