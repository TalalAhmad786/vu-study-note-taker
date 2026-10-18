'use client';

import { cn } from '@/lib/utils';

interface Props {
  max: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
  className?: string;
  disabled?: boolean;
}

const selectCls = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50';

// Two selects (from / to) shared by Quiz, Revision and the course chat's scope toggle.
export function RangePicker({ max, from, to, onChange, className, disabled }: Props) {
  const options = Array.from({ length: Math.max(max, 1) }, (_, i) => i + 1);
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">From</span>
        <select className={selectCls} value={from} disabled={disabled}
          onChange={e => { const f = Number(e.target.value); onChange(f, Math.max(f, to)); }}>
          {options.map(n => <option key={n} value={n}>L{n}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">to</span>
        <select className={selectCls} value={to} disabled={disabled}
          onChange={e => { const t = Number(e.target.value); onChange(Math.min(from, t), t); }}>
          {options.map(n => <option key={n} value={n}>L{n}</option>)}
        </select>
      </label>
    </div>
  );
}
