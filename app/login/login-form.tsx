'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState(initialError ?? '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not send the link');
      setState('idle');
      return;
    }
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
        Check <strong>{email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required autoFocus value={email}
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  );
}
