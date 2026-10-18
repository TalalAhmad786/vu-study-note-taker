// VU handouts are organised by lecture: "Lecture No. 12", "Lecture 12", "LECTURE 12: Title".
// Word uploads arrive as markdown, so allow '# ' and '**' before the heading.
const HEADING = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?(?:Lecture|LECTURE)\s*(?:No\.?|#)?\s*(\d{1,2})\b[^\n]*$/gm;

export interface HandoutPart {
  lecture: number | null; // null = text before the first lecture heading
  text: string;
}

export function splitByLecture(text: string): HandoutPart[] {
  const marks: { lecture: number; index: number }[] = [];
  for (const m of text.matchAll(HEADING)) marks.push({ lecture: Number(m[1]), index: m.index! });
  if (!marks.length) return [{ lecture: null, text: text.trim() }];

  const parts: HandoutPart[] = [];
  const pre = text.slice(0, marks[0].index).trim();
  if (pre) parts.push({ lecture: null, text: pre });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    parts.push({ lecture: mark.lecture, text: text.slice(mark.index, end).trim() });
  });

  // A table of contents repeats every heading; merge repeated lecture numbers into one part.
  const merged = new Map<number | null, string>();
  for (const p of parts) merged.set(p.lecture, merged.has(p.lecture) ? `${merged.get(p.lecture)}\n\n${p.text}` : p.text);
  return [...merged].map(([lecture, t]) => ({ lecture, text: t })).filter(p => p.text.length >= 50);
}
