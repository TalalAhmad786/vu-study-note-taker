'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DeleteCourseButton({ courseId, name }: { courseId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>Delete</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>This removes every lecture, material, note and chat in the course. It cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete course'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
