// Rough client-safe estimate (~4 characters per token for English text).
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

// $ per million tokens — from https://platform.claude.com/docs/en/about-claude/pricing
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'voyage-3.5': { input: 0.06, output: 0, cacheRead: 0, cacheWrite: 0 },
  'voyage-3-large': { input: 0.18, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export function costUsd(model: string, u: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }) {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5-5'];
  return ((u.input ?? 0) * p.input + (u.output ?? 0) * p.output
    + (u.cacheRead ?? 0) * p.cacheRead + (u.cacheWrite ?? 0) * p.cacheWrite) / 1e6;
}

export function formatUsd(n: number) {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
