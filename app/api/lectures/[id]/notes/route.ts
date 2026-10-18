import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, requireLecture, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { ALERTS_REPAIR_SYSTEM, NOTES_SYSTEM } from '@/lib/prompts';
import { splitNotesOutput } from '@/lib/notes-sections';
import { CHEAP_MODEL, MODEL } from '@/lib/models';
import { logUsage } from '@/lib/usage';
import type { ExamAlert, Material } from '@/lib/types';

export const maxDuration = 300;

const client = new Anthropic();
const Body = z.object({ force: z.boolean().optional() });

// Two clicks on "Generate" while the first call is running share one API call.
const inFlight = new Map<string, Promise<Generated>>();

interface Generated {
  markdown: string;
  examAlerts: ExamAlert[];
  title: string | null;
  usage: Anthropic.Beta.BetaUsage;
}

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const lecture = await requireLecture(id, user.id);
  const { force } = Body.parse(await req.json().catch(() => ({})));
  const db = supabaseAdmin();

  const { data: mats } = await db.from('materials')
    .select('kind, title, content, created_at').eq('lecture_id', id).order('created_at');
  const materials = (mats ?? []) as Material[];
  const join = (kind: Material['kind']) =>
    materials.filter(m => m.kind === kind).map(m => (m.title ? `(${m.title})\n${m.content}` : m.content)).join('\n\n---\n\n');

  const transcript = join('transcript');
  const handout = join('handout');
  const myNotes = join('notes');
  if (!transcript) throw new HttpError(400, 'No transcript yet');

  const user_content = [
    `Lecture number: ${lecture.number}`,
    `<transcript>\n${transcript}\n</transcript>`,
    handout ? `<handout>\n${handout}\n</handout>` : '(No handout for this lecture.)',
    myNotes ? `<student_notes>\n${myNotes}\n</student_notes>` : '',
  ].filter(Boolean).join('\n\n');

  const sourceHash = createHash('sha256').update(`${MODEL}\n${NOTES_SYSTEM}\n${user_content}`).digest('hex');

  if (!force) {
    const { data: cached } = await db.from('notes').select('markdown, exam_alerts')
      .eq('lecture_id', id).eq('source_hash', sourceHash)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cached) return NextResponse.json({ markdown: cached.markdown, examAlerts: cached.exam_alerts, cached: true });
  }

  const key = `${id}:${sourceHash}`;
  let job = inFlight.get(key);
  const owner = !job;
  if (!job) {
    job = generate(user_content).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  const result = await job;

  // Only the request that started the call stores it and logs its cost.
  if (owner) {
    const { error } = await db.from('notes').insert({
      lecture_id: id, markdown: result.markdown, exam_alerts: result.examAlerts, model: MODEL, source_hash: sourceHash,
    });
    if (error) throw error;
    if (result.title && !lecture.title) await db.from('lectures').update({ title: result.title }).eq('id', id);
    await logUsage({
      userId: user.id, courseId: lecture.course_id, operation: 'notes', model: MODEL,
      input: result.usage.input_tokens, output: result.usage.output_tokens,
      cacheRead: result.usage.cache_read_input_tokens ?? 0, cacheWrite: result.usage.cache_creation_input_tokens ?? 0,
    });
  }

  return NextResponse.json({ markdown: result.markdown, examAlerts: result.examAlerts, usage: result.usage });
});

async function generate(userContent: string): Promise<Generated> {
  // Streaming avoids HTTP timeouts on long notes; adaptive thinking shares max_tokens, so leave headroom.
  const msg = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: NOTES_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  }).finalMessage();

  if (msg.stop_reason === 'refusal') {
    throw new HttpError(422, `Claude declined to write notes for this material${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : '.'}`);
  }

  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const { markdown, json } = splitNotesOutput(text);
  let meta = parseMeta(json);
  // If parsing fails, keep the notes and recover the JSON tail with the cheap model.
  if (!meta) meta = await repairMeta(markdown);

  return { markdown, examAlerts: meta?.exam_alerts ?? [], title: meta?.title ?? null, usage: msg.usage };
}

const Meta = z.object({
  exam_alerts: z.array(z.object({
    point: z.string(), quote: z.string().default(''), handout_ref: z.string().nullable().default(null),
  })).default([]),
  title: z.string().nullable().default(null),
});

function parseMeta(json: string | null) {
  if (!json) return null;
  const attempt = (s: string) => {
    try {
      return Meta.parse(JSON.parse(s));
    } catch {
      return null;
    }
  };
  // Maths notes may carry LaTeX with single backslashes: "\alpha" is invalid JSON and "\frac"
  // silently parses as a form feed + "rac". If either happened, retry reading every backslash
  // literally (except \" and \\).
  const first = attempt(json);
  if (first && !first.exam_alerts.some(a => /[\b\f]/.test(a.point + a.quote))) return first;
  return attempt(json.replace(/\\(?!["\\])/g, '\\\\')) ?? first;
}

async function repairMeta(markdown: string) {
  try {
    const msg = await client.messages.create({
      model: CHEAP_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: ALERTS_REPAIR_SYSTEM,
      messages: [{ role: 'user', content: markdown }],
    });
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const body = text.match(/\{[\s\S]*\}/)?.[0] ?? null;
    return parseMeta(body);
  } catch (err) {
    console.error('exam-alert repair failed', err);
    return null;
  }
}
