import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/access';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${appOrigin(req)}/login`, { status: 303 });
}
