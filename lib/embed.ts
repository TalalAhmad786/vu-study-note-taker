import { VoyageAIClient, VoyageAIError } from 'voyageai';
import { HttpError } from '@/lib/auth';

const MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';
// Voyage allows 1000 inputs / 320k tokens per request for voyage-3.5; 128 chunks of ~700 tokens stays well inside.
const BATCH = 128;

let client: VoyageAIClient | null = null;
function voyage() {
  client ??= new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
  return client;
}

export const EMBED_MODEL = MODEL;

// inputType matters: 'document' when storing chunks, 'query' when embedding a question.
export async function embedMany(texts: string[], inputType: 'document' | 'query') {
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await withRetry(() => voyage().embed({
      input: texts.slice(i, i + BATCH), model: MODEL, inputType, outputDimension: 1024,
    }));
    vectors.push(...res.data!.map(d => d.embedding!));   // number[1024][]
    tokens += res.usage?.totalTokens ?? 0;
  }
  return { vectors, tokens };
}

// Voyage's free tier (no payment method) allows 3 requests a minute, so a 429 is routine: back off and retry.
const BACKOFF_MS = [5_000, 15_000, 25_000];

async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const status = err instanceof VoyageAIError ? err.statusCode : undefined;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (retryable && attempt < BACKOFF_MS.length) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
        continue;
      }
      if (status === 429) {
        throw new HttpError(429, 'Voyage embedding rate limit reached. Wait a minute and try again, or add a payment method at dashboard.voyageai.com to lift the free-tier limit.');
      }
      if (err instanceof VoyageAIError) throw new HttpError(502, `Voyage embedding failed (status ${status ?? 'unknown'}).`);
      throw err;
    }
  }
}
