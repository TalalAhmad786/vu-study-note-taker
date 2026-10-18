import { NextResponse } from 'next/server';
import { requireCourse, requireUser, route } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

// Restores a chat thread (as AI SDK UI messages) after a reload.
export const GET = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireCourse(id, user.id);
  const threadId = new URL(req.url).searchParams.get('threadId');
  if (!threadId || !/^[0-9a-f-]{36}$/i.test(threadId)) return NextResponse.json({ messages: [] });

  const { data } = await supabaseAdmin().from('chat_messages')
    .select('id, role, content').eq('course_id', id).eq('thread_id', threadId)
    .order('created_at').order('role', { ascending: false }).limit(100);
  const messages = (data ?? []).map(m => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.content }] }));
  return NextResponse.json({ messages });
});
