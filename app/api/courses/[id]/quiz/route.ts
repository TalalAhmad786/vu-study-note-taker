import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, requireCourse, requireUser, route } from '@/lib/auth';
import { latestNotesInRange, pastPaperBlock, pastPapers } from '@/lib/course-notes';
import { section } from '@/lib/notes-sections';
import { PAST_PAPER_RULE, QUIZ_SYSTEM } from '@/lib/prompts';
import { CHEAP_MODEL } from '@/lib/models';
import { fromAiSdkUsage, logUsage } from '@/lib/usage';
import type { QuizQuestion } from '@/lib/types';

export const maxDuration = 120;

const Body = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  count: z.number().int().min(1).max(30).default(10),
  mix: z.enum(['mcq', 'short', 'mixed']).default('mixed'),
});

// Structured-output schemas can't carry array-length limits, so "exactly 4 options" is enforced after.
const QuizSchema = z.object({
  questions: z.array(z.object({
    lecture: z.number(),
    type: z.enum(['mcq', 'short']),
    prompt: z.string(),
    options: z.array(z.string()).optional(),
    answer: z.string(),
    explanation: z.string(),
    fromExamAlert: z.boolean(),
  })),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id: courseId } = await params;
  await requireCourse(courseId, user.id);
  const { from, to, count, mix } = Body.parse(await req.json());
  if (from > to) throw new HttpError(400, '"From" must not be after "to"');

  const notes = await latestNotesInRange(courseId, from, to);
  if (!notes.length) throw new HttpError(400, `No generated notes in lectures ${from}–${to} yet`);
  const papers = await pastPapers(courseId);

  const material = notes.map(n => [
    `<lecture number="${n.number}"${n.title ? ` title="${n.title}"` : ''}>`,
    `<exam_alerts>\n${JSON.stringify(n.examAlerts)}\n</exam_alerts>`,
    `<key_concepts>\n${section(n.markdown, 'Key concepts')}\n</key_concepts>`,
    `<likely_exam_questions>\n${section(n.markdown, 'Likely exam questions')}\n</likely_exam_questions>`,
    '</lecture>',
  ].join('\n')).join('\n\n');

  const { output, usage } = await generateText({
    model: anthropic(CHEAP_MODEL),
    output: Output.object({ schema: QuizSchema }),
    instructions: papers.length ? `${QUIZ_SYSTEM}\n\n${PAST_PAPER_RULE}` : QUIZ_SYSTEM,
    prompt: `Lectures ${from}-${to}. Count: ${count}. Mix: ${mix}.\n\n${material}\n\n${pastPaperBlock(papers)}`,
    maxOutputTokens: 16000,
    providerOptions: { anthropic: { effort: 'low' } },
  });
  await logUsage({ userId: user.id, courseId, operation: 'quiz', model: CHEAP_MODEL, ...fromAiSdkUsage(usage) });

  const questions: QuizQuestion[] = output.questions
    .filter(q => q.type === 'short' || (q.options?.length === 4 && q.options.includes(q.answer)))
    .slice(0, count);
  if (!questions.length) throw new HttpError(502, 'The model returned no usable questions; try again');
  return NextResponse.json({ questions });
});
