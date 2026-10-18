'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { RangePicker } from '@/components/range-picker';
import type { QuizQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Result {
  answer: string;
  correct: boolean;
  score?: number;      // short answers, 1–5
  feedback?: string;
}

export function QuizRunner({ courseId, max, defaultFrom, defaultTo }: { courseId: string; max: number; defaultFrom: number; defaultTo: number }) {
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });
  const [count, setCount] = useState(10);
  const [mix, setMix] = useState<'mixed' | 'mcq' | 'short'>('mixed');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<(Result | undefined)[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<'setup' | 'loading' | 'quiz' | 'grading' | 'done' | 'review'>('setup');
  const [error, setError] = useState('');

  async function start() {
    setPhase('loading');
    setError('');
    const res = await fetch(`/api/courses/${courseId}/quiz`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: range.from, to: range.to, count, mix }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not build the quiz');
      setPhase('setup');
      return;
    }
    setQuestions(data.questions);
    setResults([]);
    setIndex(0);
    setDraft('');
    setPhase('quiz');
  }

  const q = questions[index];
  const r = results[index];

  function record(result: Result) {
    setResults(prev => { const next = [...prev]; next[index] = result; return next; });
  }

  // MCQs are graded locally.
  function pick(option: string) {
    if (r) return;
    record({ answer: option, correct: option === q.answer });
  }

  // Short answers go to Haiku for a 1–5 score and one line of feedback.
  async function submitShort() {
    setPhase('grading');
    const res = await fetch(`/api/courses/${courseId}/quiz/grade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: q.prompt, modelAnswer: q.answer, studentAnswer: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setPhase('quiz');
    if (!res.ok) return setError(data.error ?? 'Grading failed');
    record({ answer: draft, correct: data.score >= 4, score: data.score, feedback: data.feedback });
  }

  function next() {
    setDraft('');
    setError('');
    if (index + 1 < questions.length) setIndex(index + 1);
    else setPhase('done');
  }

  if (phase === 'setup' || phase === 'loading') {
    return (
      <Card>
        <CardContent className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center gap-4">
            <RangePicker max={max} from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} disabled={phase === 'loading'} />
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Questions</span>
              <select value={count} onChange={e => setCount(Number(e.target.value))} className="h-8 rounded-lg border border-input bg-transparent px-2">
                {[5, 10, 15, 20].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Type</span>
              <select value={mix} onChange={e => setMix(e.target.value as typeof mix)} className="h-8 rounded-lg border border-input bg-transparent px-2">
                <option value="mixed">Mixed</option>
                <option value="mcq">MCQ only</option>
                <option value="short">Short answer only</option>
              </select>
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={start} disabled={phase === 'loading'}>{phase === 'loading' ? 'Writing questions…' : 'Start quiz'}</Button>
        </CardContent>
      </Card>
    );
  }

  const answered = results.filter(Boolean) as Result[];
  const mcqs = questions.map((qq, i) => ({ qq, r: results[i] })).filter(x => x.qq.type === 'mcq');
  const shorts = questions.map((qq, i) => ({ qq, r: results[i] })).filter(x => x.qq.type === 'short');
  const mcqRight = mcqs.filter(x => x.r?.correct).length;
  const shortAvg = shorts.length ? shorts.reduce((s, x) => s + (x.r?.score ?? 0), 0) / shorts.length : 0;
  const wrong = questions.map((qq, i) => ({ qq, r: results[i], i })).filter(x => !x.r?.correct);

  if (phase === 'done' || phase === 'review') {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-2">
            <h2 className="text-lg font-semibold">Score</h2>
            <div className="flex flex-wrap gap-6 text-sm">
              {mcqs.length > 0 && <span><strong className="text-2xl">{mcqRight}/{mcqs.length}</strong> <span className="text-muted-foreground">MCQs correct</span></span>}
              {shorts.length > 0 && <span><strong className="text-2xl">{shortAvg.toFixed(1)}/5</strong> <span className="text-muted-foreground">short-answer average</span></span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {wrong.length > 0 && phase !== 'review' && <Button onClick={() => setPhase('review')}>Review wrong answers ({wrong.length})</Button>}
              <Button variant="outline" onClick={() => setPhase('setup')}>New quiz</Button>
            </div>
          </CardContent>
        </Card>
        {phase === 'review' && wrong.map(({ qq, r: rr, i }) => (
          <Card key={i}>
            <CardContent className="space-y-2 pt-2 text-sm">
              <QuestionMeta q={qq} courseId={courseId} n={i + 1} total={questions.length} />
              <p className="font-medium">{qq.prompt}</p>
              <p><span className="text-muted-foreground">Your answer:</span> {rr?.answer || <em>none</em>}{rr?.score ? ` (${rr.score}/5)` : ''}</p>
              {rr?.feedback && <p className="text-muted-foreground">{rr.feedback}</p>}
              <p><span className="text-muted-foreground">Correct answer:</span> {qq.answer}</p>
              <p className="text-muted-foreground">{qq.explanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-2">
        <div className="h-1 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(answered.length / questions.length) * 100}%` }} />
        </div>
        <QuestionMeta q={q} courseId={courseId} n={index + 1} total={questions.length} />
        <p className="text-base font-medium whitespace-pre-wrap">{q.prompt}</p>

        {q.type === 'mcq' ? (
          <div className="grid gap-2">
            {q.options!.map((o, i) => {
              const isAnswer = o === q.answer;
              const isPicked = r?.answer === o;
              return (
                <button key={i} type="button" onClick={() => pick(o)} disabled={!!r}
                  className={cn('rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    !r && 'hover:bg-muted',
                    r && isAnswer && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
                    r && isPicked && !isAnswer && 'border-destructive bg-destructive/10')}>
                  <span className="mr-2 font-mono text-muted-foreground">{String.fromCharCode(65 + i)}.</span>{o}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea value={r ? r.answer : draft} onChange={e => setDraft(e.target.value)} disabled={!!r || phase === 'grading'}
              placeholder="Write your answer (3–5 lines)…" className="min-h-28" />
            {!r && <Button onClick={submitShort} disabled={phase === 'grading'}>{phase === 'grading' ? 'Grading…' : 'Submit answer'}</Button>}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {r && (
          <div className={cn('space-y-1 rounded-lg p-3 text-sm', r.correct ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-amber-50 dark:bg-amber-950/40')}>
            <p className="font-medium">
              {q.type === 'mcq' ? (r.correct ? 'Correct' : `Not quite — the answer is: ${q.answer}`) : `Score: ${r.score}/5`}
            </p>
            {r.feedback && <p>{r.feedback}</p>}
            {q.type === 'short' && <p><span className="text-muted-foreground">Model answer:</span> {q.answer}</p>}
            <p className="text-muted-foreground">{q.explanation}</p>
          </div>
        )}

        {r && <Button onClick={next}>{index + 1 < questions.length ? 'Next' : 'See score'}</Button>}
      </CardContent>
    </Card>
  );
}

function QuestionMeta({ q, courseId, n, total }: { q: QuizQuestion; courseId: string; n: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Question {n} of {total}</span>
      <Link href={`/courses/${courseId}/lectures/${q.lecture}`} className="rounded bg-primary/10 px-1.5 font-medium text-primary">L{q.lecture}</Link>
      <Badge variant="outline">{q.type === 'mcq' ? 'MCQ' : 'Short answer'}</Badge>
      {q.fromExamAlert && <Badge className="bg-amber-500 text-white">From exam alert</Badge>}
    </div>
  );
}
