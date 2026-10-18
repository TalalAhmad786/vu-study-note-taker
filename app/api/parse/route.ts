import { NextResponse } from 'next/server';
import { HttpError, requireUser, route } from '@/lib/auth';

// Forwards an upload to the local Docling service (parser/server.py). The browser never talks to
// it directly; when it isn't running, GET reports unavailable and uploads fall back to lib/extract.
export const maxDuration = 900;

const DOCLING_URL = process.env.DOCLING_URL || 'http://127.0.0.1:5001';
const MAX_BYTES = 50 * 1024 * 1024;

export const GET = route(async () => {
  await requireUser();
  try {
    const res = await fetch(`${DOCLING_URL}/health`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    return NextResponse.json({ available: res.ok });
  } catch {
    return NextResponse.json({ available: false });
  }
});

export const POST = route(async (req: Request) => {
  await requireUser();
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file uploaded');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'File is larger than 50 MB');

  const upstream = new FormData();
  upstream.append('file', file, file.name);
  upstream.append('formulas', form.get('formulas') === 'true' ? 'true' : 'false');

  let res: Response;
  try {
    res = await fetch(`${DOCLING_URL}/convert`, { method: 'POST', body: upstream, signal: AbortSignal.timeout(850_000) });
  } catch {
    throw new HttpError(503, 'The Docling parser is not running. Start it with `npm run parser`, or switch to the quick parser.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status === 415 || res.status === 413 ? res.status : 502, data?.detail ?? 'Docling could not parse this file');
  return NextResponse.json({
    text: data.text as string, pages: data.pages as number,
    formulasSkipped: (data.formulas_skipped as number) ?? 0, seconds: data.seconds as number,
  });
});
