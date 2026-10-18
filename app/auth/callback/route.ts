import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { appOrigin, isAllowedEmail } from '@/lib/access';

// Magic-link landing: handles both the PKCE `code` flow and the `token_hash` email template flow.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const supabase = await supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('Missing code') };

  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);

  // An account outside the allowlist (e.g. created before the list was set) gets no session.
  const { data } = await supabase.auth.getUser();
  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('This email address is not allowed to use this app.')}`);
  }
  return NextResponse.redirect(`${origin}/`);
}
