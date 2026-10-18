import { supabaseAdmin } from '@/lib/supabase';
import type { ExamAlert } from '@/lib/types';

export interface LectureNotes {
  number: number;
  title: string | null;
  markdown: string;
  examAlerts: ExamAlert[];
}

// Latest notes version for every lecture in [from, to].
export async function latestNotesInRange(courseId: string, from: number, to: number): Promise<LectureNotes[]> {
  const { data, error } = await supabaseAdmin().from('lectures')
    .select('number, title, notes(markdown, exam_alerts, created_at)')
    .eq('course_id', courseId).gte('number', from).lte('number', to).order('number');
  if (error) throw error;
  return (data ?? []).flatMap(l => {
    const latest = [...(l.notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest ? [{ number: l.number, title: l.title, markdown: latest.markdown, examAlerts: latest.exam_alerts ?? [] }] : [];
  });
}

export async function pastPapers(courseId: string) {
  const { data } = await supabaseAdmin().from('materials')
    .select('title, content').eq('course_id', courseId).eq('kind', 'past_paper').order('created_at');
  return (data ?? []) as { title: string | null; content: string }[];
}

export function pastPaperBlock(papers: { title: string | null; content: string }[]) {
  if (!papers.length) return '';
  return papers.map((p, i) => `<past_paper name="${p.title || `Past paper ${i + 1}`}">\n${p.content}\n</past_paper>`).join('\n');
}
