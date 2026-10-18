import { supabaseAdmin } from '@/lib/supabase';

// Lecture numbers that have generated notes (quiz and revision only work from notes).
export async function lecturesWithNotes(courseId: string) {
  const { data } = await supabaseAdmin().from('lectures')
    .select('number, notes!inner(id)').eq('course_id', courseId).order('number');
  return [...new Set((data ?? []).map(l => l.number as number))];
}
