import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCourse, requireUser, route } from '@/lib/auth';
import { GRADE_SYSTEM } from '@/lib/prompts';
import { CHEAP_MODEL } from '@/lib/models';
import { fromAiSdkUsage, logUsage } from '@/lib/usage';

const Body = z.object({
  prompt: z.string().min(1),
  modelAnswer: z.string().min(1),
  studentAnswer: z.string(),
});

const Grade = z.object({ score: z.number().describe('Integer 1-5'), feedback: z.string() });

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id: courseId } = await params;
  await requireCourse(courseId, user.id);
  const body = Body.parse(await req.json());
  if (!body.studentAnswer.trim()) return NextResponse.json({ score: 1, feedback: 'No answer given.' });

  const { output, usage } = await generateText({
    model: anthropic(CHEAP_MODEL),
    output: Output.object({ schema: Grade }),
    instructions: GRADE_SYSTEM,
    prompt: `<question>\n${body.prompt}\n</question>\n<model_answer>\n${body.modelAnswer}\n</model_answer>\n<student_answer>\n${body.studentAnswer}\n</student_answer>`,
    maxOutputTokens: 4000,
    providerOptions: { anthropic: { effort: 'low' } },
  });
  await logUsage({ userId: user.id, courseId, operation: 'grade', model: CHEAP_MODEL, ...fromAiSdkUsage(usage) });

  return NextResponse.json({ score: Math.min(5, Math.max(1, Math.round(output.score))), feedback: output.feedback });
});
