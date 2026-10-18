import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLecture, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({ title: z.string().trim().max(300).nullable() });

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireLecture(id, user.id);
  const body = Patch.parse(await req.json());
  const { error } = await supabaseAdmin().from('lectures').update({ title: body.title || null }).eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireLecture(id, user.id);
  const { error } = await supabaseAdmin().from('lectures').delete().eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
