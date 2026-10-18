'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewCourseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', instructor: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/courses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? 'Could not create the course');
    setOpen(false);
    setForm({ code: '', name: '', instructor: '' });
    router.push(`/courses/${data.id}`);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New course</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New course</DialogTitle>
              <DialogDescription>Add a Virtual University course to study.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" required placeholder="CS201" value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required placeholder="Introduction to Programming" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instructor">Instructor (optional)</Label>
              <Input id="instructor" value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create course'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
