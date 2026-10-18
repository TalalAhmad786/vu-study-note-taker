import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  code: z.string().trim().min(2).max(20).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  instructor: z.string().trim().max(200).nullable().optional(),
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireCourse(id, user.id);
  const body = Patch.parse(await req.json());
  const { error } = await supabaseAdmin().from('courses').update(body).eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireCourse(id, user.id);
  const { error } = await supabaseAdmin().from('courses').delete().eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
