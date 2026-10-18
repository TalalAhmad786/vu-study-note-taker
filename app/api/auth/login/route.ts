import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, route } from '@/lib/auth';
import { appOrigin, isAllowedEmail } from '@/lib/access';
import { supabaseServer } from '@/lib/supabase/server';

const Body = z.object({ email: z.string().email() });

export const POST = route(async (req: Request) => {
  const { email } = Body.parse(await req.json());
  if (!isAllowedEmail(email)) throw new HttpError(403, 'This email address is not allowed to use this app.');
  const supabase = await supabaseServer();
  const origin = appOrigin(req);
  const { error } = await supabase.auth.signInWithOtp({
    email, options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
