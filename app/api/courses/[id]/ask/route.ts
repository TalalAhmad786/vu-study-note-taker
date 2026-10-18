import { anthropic } from '@ai-sdk/anthropic';
import {
  createUIMessageStreamResponse, streamText, toUIMessageStream,
  type ModelMessage, type UIMessage,
} from 'ai';
import { z } from 'zod';
import { HttpError, requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { EMBED_MODEL, embedMany } from '@/lib/embed';
import { LECTURE_QA_SYSTEM, QA_SYSTEM } from '@/lib/prompts';
import { MODEL } from '@/lib/models';
import { fromAiSdkUsage, logUsage } from '@/lib/usage';
import type { ExamAlert, MaterialKind } from '@/lib/types';

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1),
  threadId: z.string().uuid(),
  lectureFrom: z.number().int().nullish(),
  lectureTo: z.number().int().nullish(),
  lectureNumber: z.number().int().nullish(),   // set when asked from a lecture page
});

interface Hit { chunk_id: string; lecture_number: number | null; kind: MaterialKind; content: string; similarity: number }

const CACHE = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id: courseId } = await params;
  await requireCourse(courseId, user.id);
  const body = Body.parse(await req.json());
  const db = supabaseAdmin();

  const textOf = (m: UIMessage) => m.parts.map(p => (p.type === 'text' ? p.text : '')).join('');
  const last = body.messages[body.messages.length - 1];
  const question = textOf(last).trim();
  if (last.role !== 'user' || !question) throw new HttpError(400, 'Ask a question');

  const history: ModelMessage[] = body.messages.slice(0, -1).slice(-6)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: textOf(m) }))
    .filter(m => m.content);

  let instructions: string;
  let messages: ModelMessage[];
  let citations: { lecture_number: number | null; chunk_id: string | null }[] = [];

  if (body.lectureNumber) {
    // Single-lecture question: skip retrieval and send the whole lecture, cached across follow-ups.
    const { data: lecture } = await db.from('lectures')
      .select('id, number, title, materials(kind, title, content), notes(exam_alerts, created_at)')
      .eq('course_id', courseId).eq('number', body.lectureNumber).maybeSingle();
    if (!lecture || !lecture.materials?.length) throw new HttpError(400, 'Add material to this lecture first');

    const material = (lecture.materials as { kind: MaterialKind; title: string | null; content: string }[])
      .map(m => `<material kind="${m.kind}"${m.title ? ` title="${m.title}"` : ''}>\n${m.content}\n</material>`).join('\n');
    const latest = [...(lecture.notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const alerts = latest?.exam_alerts?.length ? `\n<exam_alerts>\n${JSON.stringify(latest.exam_alerts)}\n</exam_alerts>` : '';

    instructions = LECTURE_QA_SYSTEM.replaceAll('{N}', String(lecture.number));
    messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: `<lecture number="${lecture.number}">\n${material}${alerts}\n</lecture>`, providerOptions: CACHE }],
      },
      ...history,
      { role: 'user', content: question },
    ];
    citations = [{ lecture_number: lecture.number, chunk_id: null }];
  } else {
    const { vectors, tokens } = await embedMany([question], 'query');
    await logUsage({ userId: user.id, courseId, operation: 'embed', model: EMBED_MODEL, input: tokens });

    const { data, error } = await db.rpc('match_chunks', {
      p_course_id: courseId, p_query: vectors[0], p_limit: 12,
      p_lecture_from: body.lectureFrom ?? null, p_lecture_to: body.lectureTo ?? null,
      p_query_text: question,
    });
    if (error) throw error;
    const hits = (data ?? []) as Hit[];

    const lectureNums = [...new Set(hits.map(h => h.lecture_number).filter((n): n is number => n != null))];
    const alertsByLecture = new Map<number, ExamAlert[]>();
    if (lectureNums.length) {
      const { data: notes } = await db.from('notes')
        .select('exam_alerts, created_at, lectures!inner(number, course_id)')
        .eq('lectures.course_id', courseId).in('lectures.number', lectureNums)
        .order('created_at', { ascending: false });
      // Only the latest notes version per lecture.
      for (const n of (notes ?? []) as unknown as { exam_alerts: ExamAlert[]; lectures: { number: number } }[]) {
        if (!alertsByLecture.has(n.lectures.number) && n.exam_alerts?.length) alertsByLecture.set(n.lectures.number, n.exam_alerts);
      }
    }

    const context = hits.length
      ? hits.map((h, i) =>
        `<chunk id="${i + 1}" lecture="${h.lecture_number ?? 'course'}" kind="${h.kind}">\n${h.content}\n</chunk>`).join('\n')
      : '<no_matching_material/>';
    const alertText = alertsByLecture.size
      ? `<exam_alerts>\n${JSON.stringify([...alertsByLecture].map(([lecture, alerts]) => ({ lecture, alerts })))}\n</exam_alerts>`
      : '';
    const scope = body.lectureFrom || body.lectureTo
      ? `(The student scoped this question to lectures ${body.lectureFrom ?? 1}–${body.lectureTo ?? 'end'}.)\n\n` : '';

    instructions = QA_SYSTEM;
    messages = [...history, { role: 'user', content: `${context}\n\n${alertText}\n\n${scope}Question: ${question}` }];
    citations = hits.map(h => ({ lecture_number: h.lecture_number, chunk_id: h.chunk_id }));
  }

  const result = streamText({
    model: anthropic(MODEL),
    instructions,
    messages,
    maxOutputTokens: 8000,
    providerOptions: { anthropic: { effort: 'medium' } },
    onEnd: async ({ text, usage }) => {
      await db.from('chat_messages').insert([
        { course_id: courseId, thread_id: body.threadId, role: 'user', content: question },
        { course_id: courseId, thread_id: body.threadId, role: 'assistant', content: text, citations },
      ]);
      await logUsage({ userId: user.id, courseId, operation: 'ask', model: MODEL, ...fromAiSdkUsage(usage) });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: err => (err instanceof Error ? err.message : 'The answer failed to stream'),
    }),
  });
});
