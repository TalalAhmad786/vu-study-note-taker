export type MaterialKind = 'transcript' | 'handout' | 'notes' | 'past_paper';

export const MATERIAL_KINDS: { value: MaterialKind; label: string }[] = [
  { value: 'transcript', label: 'Transcript' },
  { value: 'handout', label: 'Handout' },
  { value: 'notes', label: 'My notes' },
  { value: 'past_paper', label: 'Past paper' },
];

export interface Course {
  id: string;
  user_id: string;
  code: string;
  name: string;
  instructor: string | null;
  created_at: string;
}

export interface Lecture {
  id: string;
  course_id: string;
  number: number;
  title: string | null;
}

export interface Material {
  id: string;
  lecture_id: string | null;
  course_id: string;
  kind: MaterialKind;
  title: string | null;
  content: string;
  token_count: number | null;
  created_at: string;
}

export interface ExamAlert {
  point: string;
  quote: string;
  handout_ref: string | null;
}

export interface Note {
  id: string;
  lecture_id: string;
  markdown: string;
  exam_alerts: ExamAlert[];
  model: string;
  created_at: string;
}

export interface QuizQuestion {
  lecture: number;
  type: 'mcq' | 'short';
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  fromExamAlert: boolean;
}

export type LectureStatus = 'empty' | 'material' | 'transcript' | 'notes';
