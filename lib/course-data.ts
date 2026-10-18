import { supabaseAdmin } from '@/lib/supabase';
import type { GridTile } from '@/components/lecture-grid';
import type { LectureStatus, MaterialKind } from '@/lib/types';

export const DEFAULT_LECTURES = 45;

// One query for every lecture's status dot.
export async function lectureTiles(courseId: string) {
  const { data } = await supabaseAdmin().from('lectures')
    .select('number, title, materials(kind), notes(id)').eq('course_id', courseId).order('number');
  const byNumber = new Map<number, GridTile>();
  for (const l of data ?? []) {
    const kinds = new Set((l.materials ?? []).map((m: { kind: MaterialKind }) => m.kind));
    const status: LectureStatus = l.notes?.length ? 'notes' : kinds.has('transcript') ? 'transcript' : kinds.size ? 'material' : 'empty';
    byNumber.set(l.number, { number: l.number, title: l.title, status });
  }
  const max = Math.max(DEFAULT_LECTURES, ...byNumber.keys());
  const tiles = Array.from({ length: max }, (_, i) => byNumber.get(i + 1) ?? { number: i + 1, title: null, status: 'empty' as const });
  const used = [...byNumber.values()].filter(t => t.status !== 'empty').map(t => t.number);
  return { tiles, max, lastUsed: used.length ? Math.max(...used) : 0 };
}
