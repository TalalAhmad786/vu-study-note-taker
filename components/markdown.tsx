'use client';

import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

// [L12], [L3, L5] and [L3-L5] become links the renderer turns into chips.
function linkCitations(md: string, courseId: string) {
  return md.replace(/\[(L\d+(?:\s*(?:,|–|-|and)\s*L?\d+)*)\](?!\()/g, (_, inner: string) =>
    inner.split(/\s*(?:,|and)\s*/).map(part => {
      const range = part.match(/L?(\d+)\s*[–-]\s*L?(\d+)/);
      const n = range ? range[1] : part.replace(/\D/g, '');
      return `[${range ? `L${range[1]}–${range[2]}` : `L${n}`}](/courses/${courseId}/lectures/${n}#cite)`;
    }).join(' '));
}

const heading = (Tag: 'h1' | 'h2' | 'h3') => {
  const H = ({ children }: { children?: React.ReactNode }) => <Tag id={slugify(textOf(children))}>{children}</Tag>;
  H.displayName = Tag;
  return H;
};

export function Markdown({ children, courseId, className }: { children: string; courseId?: string; className?: string }) {
  const components: Components = {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    a: ({ href, children: c }) => {
      if (href?.endsWith('#cite')) {
        return (
          <Link href={href.replace('#cite', '')}
            className="mx-0.5 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0 text-xs font-medium text-primary no-underline hover:bg-primary/20">
            {c}
          </Link>
        );
      }
      return <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{c}</a>;
    },
  };
  return (
    <div className={cn('prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-pre:bg-muted prose-pre:text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {displayMath(courseId ? linkCitations(children, courseId) : children)}
      </ReactMarkdown>
    </div>
  );
}

// remark-math only treats $$ on its own line as a display block; Docling and Claude usually write
// "$$ ... $$" on one line, which would render inline. Split such lines into a proper block.
function displayMath(md: string) {
  return md.replace(/^([ \t]*)\$\$(.+?)\$\$[ \t]*$/gm, (_, indent, tex) => `${indent}$$\n${indent}${tex.trim()}\n${indent}$$`);
}
