import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, requireCourse, requireUser, route } from '@/lib/auth';
import { latestNotesInRange, pastPaperBlock, pastPapers } from '@/lib/course-notes';
import { chunkText } from '@/lib/chunk';
import { EMBED_MODEL, embedMany } from '@/lib/embed';
import { PAST_PAPER_RULE, REVISION_SYSTEM } from '@/lib/prompts';
import { MODEL } from '@/lib/models';
import { supabaseAdmin } from '@/lib/supabase';
import { estimateTokens } from '@/lib/tokens';
import { fromAiSdkUsage, logUsage } from '@/lib/usage';

export const maxDuration = 300;

const Body = z.object({ from: z.number().int().min(1), to: z.number().int().min(1) });

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id: courseId } = await params;
  await requireCourse(courseId, user.id);
  const { from, to } = Body.parse(await req.json());
  if (from > to) throw new HttpError(400, '"From" must not be after "to"');

  const notes = await latestNotesInRange(courseId, from, to);
  if (!notes.length) throw new HttpError(400, `No generated notes in lectures ${from}–${to} yet`);
  const papers = await pastPapers(courseId);

  const material = notes.map(n =>
    `<lecture number="${n.number}">\n${n.markdown}\n<exam_alerts>${JSON.stringify(n.examAlerts)}</exam_alerts>\n</lecture>`).join('\n\n');

  const range = from === to ? `Lecture ${from}` : `Lectures ${from}–${to}`;
  const { text, usage } = await generateText({
    model: anthropic(MODEL),
    instructions: (papers.length ? `${REVISION_SYSTEM}\n\n${PAST_PAPER_RULE}` : REVISION_SYSTEM)
      .replace('{range}', range),
    prompt: `${material}\n\n${pastPaperBlock(papers)}`,
    maxOutputTokens: 32000,
    providerOptions: { anthropic: { effort: 'medium' } },
  });
  await logUsage({ userId: user.id, courseId, operation: 'revision', model: MODEL, ...fromAiSdkUsage(usage) });

  // Store as course-wide "notes" material so the sheet is also searchable in Q&A.
  const title = from === to ? `Revision: L${from}` : `Revision: L${from}–L${to}`;
  const db = supabaseAdmin();
  const pieces = chunkText(text, `[NOTES · ${title}]`);
  const { vectors, tokens } = await embedMany(pieces, 'document');
  const { data: mat, error } = await db.from('materials').insert({
    course_id: courseId, lecture_id: null, kind: 'notes', title, content: text, token_count: estimateTokens(text),
  }).select('id, created_at').single();
  if (error) throw error;
  const { error: chunkErr } = await db.from('chunks').insert(pieces.map((content, i) => ({
    material_id: mat.id, course_id: courseId, lecture_id: null, kind: 'notes', position: i, content, embedding: vectors[i],
  })));
  if (chunkErr) throw chunkErr;
  await logUsage({ userId: user.id, courseId, operation: 'embed', model: EMBED_MODEL, input: tokens });

  return NextResponse.json({ id: mat.id, title, markdown: text, created_at: mat.created_at, lectures: notes.map(n => n.number) });
});
