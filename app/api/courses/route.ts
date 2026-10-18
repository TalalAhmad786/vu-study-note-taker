import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const Body = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(200),
  instructor: z.string().trim().max(200).optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  const { data, error } = await supabaseAdmin().from('courses').insert({
    user_id: user.id, code: body.code.toUpperCase(), name: body.name, instructor: body.instructor || null,
  }).select('id').single();
  if (error) throw error;
  return NextResponse.json({ id: data.id });
});
