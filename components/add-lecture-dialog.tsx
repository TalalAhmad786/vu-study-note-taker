'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AddLectureDialog({ courseId, nextNumber }: { courseId: string; nextNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(String(nextNumber));
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/courses/${courseId}/lectures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: Number(number), title: title || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? 'Could not add the lecture');
    setOpen(false);
    router.push(`/courses/${courseId}/lectures/${data.number}`);
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setNumber(String(nextNumber)); setOpen(true); }}>Add lecture</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>Add lecture</DialogTitle></DialogHeader>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="num">Number</Label>
                <Input id="num" type="number" min={1} max={200} required value={number} onChange={e => setNumber(e.target.value)} />
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label htmlFor="ltitle">Title (optional — filled in by notes)</Label>
                <Input id="ltitle" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="submit">Add</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
