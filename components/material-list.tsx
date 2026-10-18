'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MATERIAL_KINDS, type MaterialKind } from '@/lib/types';

export interface MaterialSummary {
  id: string;
  kind: MaterialKind;
  title: string | null;
  token_count: number | null;
  created_at: string;
  lecture_number?: number | null;
  preview?: string;
}

export function MaterialList({ items, empty }: { items: MaterialSummary[]; empty?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    await fetch(`/api/materials/${id}`, { method: 'DELETE' });
    setDeleting(null);
    setConfirming(null);
    router.refresh();
  }

  if (!items.length) return <p className="text-sm text-muted-foreground">{empty ?? 'Nothing saved yet.'}</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {items.map(m => (
        <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant="secondary">{MATERIAL_KINDS.find(k => k.value === m.kind)?.label}</Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              {m.lecture_number ? <span className="mr-1 font-medium">L{m.lecture_number}</span> : null}
              {m.title || m.preview || 'Untitled'}
            </p>
            <p className="text-xs text-muted-foreground">
              ≈{(m.token_count ?? 0).toLocaleString()} tokens · {new Date(m.created_at).toLocaleDateString()}
            </p>
          </div>
          {confirming === m.id ? (
            <div className="flex gap-1">
              <Button size="xs" variant="destructive" disabled={deleting === m.id} onClick={() => remove(m.id)}>
                {deleting === m.id ? 'Deleting…' : 'Delete'}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
            </div>
          ) : (
            <Button size="xs" variant="ghost" onClick={() => setConfirming(m.id)}>Remove</Button>
          )}
        </li>
      ))}
    </ul>
  );
}
