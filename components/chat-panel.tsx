'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/markdown';
import { RangePicker } from '@/components/range-picker';
import { cn } from '@/lib/utils';

interface Props {
  courseId: string;
  lectureNumber?: number;   // lecture page: full-transcript mode, no retrieval
  maxLecture?: number;      // course page: enables the lecture-range scope toggle
  className?: string;
}

const SUGGESTIONS_COURSE = ['What did the instructor flag as most important?', 'Which topics are likely in the midterm?'];
const SUGGESTIONS_LECTURE = ['Summarise this lecture in 5 points', 'Explain the hardest concept with an example'];

export function ChatPanel({ courseId, lectureNumber, maxLecture, className }: Props) {
  const threadKey = `vu-thread:${courseId}:${lectureNumber ?? 'course'}`;
  const threadId = useRef<string | null>(null);
  const [input, setInput] = useState('');
  const [scoped, setScoped] = useState(false);
  const [range, setRange] = useState({ from: 1, to: Math.max(1, Math.min(22, maxLecture ?? 1)) });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: `/api/courses/${courseId}/ask` }), [courseId]);

  const { messages, sendMessage, setMessages, status, error, stop, clearError } = useChat({ transport });

  // Restore (or start) the thread for this course/lecture.
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(threadKey); } catch { /* no storage */ }
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(threadKey, id); } catch { /* no storage */ }
    }
    threadId.current = id;
    fetch(`/api/courses/${courseId}/chat?threadId=${id}`)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: UIMessage[] }) => setMessages(d.messages))
      .catch(() => {});
  }, [threadKey, courseId, setMessages]);

  // "/" focuses the chat from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !t.closest('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const busy = status === 'submitted' || status === 'streaming';

  function ask(text: string) {
    const q = text.trim();
    if (!q || busy || !threadId.current) return;
    clearError();
    // Scope travels with each request, so changing it never recreates the chat.
    sendMessage({ text: q }, {
      body: {
        threadId: threadId.current,
        lectureNumber: lectureNumber ?? null,
        lectureFrom: !lectureNumber && scoped ? range.from : null,
        lectureTo: !lectureNumber && scoped ? range.to : null,
      },
    });
    setInput('');
  }

  function newThread() {
    const id = crypto.randomUUID();
    try { localStorage.setItem(threadKey, id); } catch { /* no storage */ }
    threadId.current = id;
    setMessages([]);
  }

  return (
    <section className={cn('no-print flex min-h-0 flex-col rounded-xl border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{lectureNumber ? `Ask about Lecture ${lectureNumber}` : 'Ask the course'}</h2>
        <div className="flex items-center gap-2">
          {!lectureNumber && maxLecture ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={scoped} onChange={e => setScoped(e.target.checked)} />
              Limit to lectures
            </label>
          ) : null}
          <Button variant="ghost" size="xs" onClick={newThread} disabled={busy}>New chat</Button>
        </div>
      </div>
      {!lectureNumber && maxLecture && scoped ? (
        <RangePicker className="border-b px-3 py-2" max={maxLecture} from={range.from} to={range.to}
          onChange={(from, to) => setRange({ from, to })} />
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{lectureNumber
              ? 'Answers use this lecture’s full transcript, handout and notes.'
              : 'Answers come from your course material and cite lecture numbers.'} Press <kbd className="rounded border px-1">/</kbd> to type.</p>
            <div className="flex flex-wrap gap-1.5">
              {(lectureNumber ? SUGGESTIONS_LECTURE : SUGGESTIONS_COURSE).map(s => (
                <button key={s} type="button" onClick={() => ask(s)}
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => {
          const text = m.parts.map(p => (p.type === 'text' ? p.text : '')).join('');
          return m.role === 'user' ? (
            <div key={m.id} className="ml-8 rounded-xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{text}</div>
          ) : (
            <div key={m.id} className="text-sm">
              {text ? <Markdown courseId={courseId} className="prose-sm">{text}</Markdown> : <Thinking />}
            </div>
          );
        })}
        {status === 'submitted' && <Thinking />}
        {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{readError(error)}</p>}
        <div ref={endRef} />
      </div>

      <form className="border-t p-2" onSubmit={e => { e.preventDefault(); ask(input); }}>
        <Textarea ref={inputRef} value={input} rows={2} placeholder="Ask anything… (Enter to send, Shift+Enter for a new line)"
          className="min-h-0 resize-none text-sm"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
        <div className="mt-2 flex justify-end gap-2">
          {busy && <Button type="button" size="sm" variant="outline" onClick={() => stop()}>Stop</Button>}
          <Button type="submit" size="sm" disabled={busy || !input.trim()}>Ask</Button>
        </div>
      </form>
    </section>
  );
}

function Thinking() {
  return <p className="animate-pulse text-sm text-muted-foreground">Thinking…</p>;
}

function readError(err: Error) {
  try {
    return JSON.parse(err.message).error ?? err.message;
  } catch {
    return err.message || 'Something went wrong';
  }
}
