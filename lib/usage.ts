import { supabaseAdmin } from '@/lib/supabase';
import { costUsd } from '@/lib/tokens';

export interface UsageEntry {
  userId: string;
  courseId?: string | null;
  operation: 'notes' | 'ask' | 'quiz' | 'grade' | 'revision' | 'embed';
  model: string;
  input?: number;        // uncached input tokens
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

// Never let a logging failure break the user-facing request.
export async function logUsage(e: UsageEntry) {
  const cost = costUsd(e.model, e);
  const { error } = await supabaseAdmin().from('usage_log').insert({
    user_id: e.userId, course_id: e.courseId ?? null, operation: e.operation, model: e.model,
    input_tokens: e.input ?? 0, output_tokens: e.output ?? 0,
    cache_read_tokens: e.cacheRead ?? 0, cache_write_tokens: e.cacheWrite ?? 0, cost_usd: cost,
  });
  if (error) console.error('usage_log insert failed', error.message);
  return cost;
}

// Normalise AI SDK usage (inputTokens includes cached tokens) into our uncached/cached split.
export function fromAiSdkUsage(u: {
  inputTokens?: number; outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number; noCacheTokens?: number };
}) {
  const cacheRead = u.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = u.inputTokenDetails?.cacheWriteTokens ?? 0;
  const input = u.inputTokenDetails?.noCacheTokens ?? Math.max(0, (u.inputTokens ?? 0) - cacheRead - cacheWrite);
  return { input, output: u.outputTokens ?? 0, cacheRead, cacheWrite };
}
