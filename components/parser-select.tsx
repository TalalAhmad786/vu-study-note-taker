'use client';

import { useEffect, useState } from 'react';
import { doclingAvailable, type ParserMode } from '@/lib/extract';

const STORAGE_KEY = 'vu-parser-mode';

function savedMode(): ParserMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'docling' || v === 'docling-math' ? v : 'quick';
  } catch {
    return 'quick';
  }
}

// Which parser uploads use. Docling options only appear while the local service is running;
// the choice is remembered per browser.
export function useParserMode() {
  const [available, setAvailable] = useState(false);
  const [chosen, setChosen] = useState<ParserMode>(savedMode);
  useEffect(() => { doclingAvailable().then(setAvailable); }, []);

  const setMode = (m: ParserMode) => {
    setChosen(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* preference is best-effort */ }
  };
  return { mode: available ? chosen : 'quick' as ParserMode, setMode, available };
}

export function ParserSelect({ mode, setMode, available, disabled }: ReturnType<typeof useParserMode> & { disabled?: boolean }) {
  if (!available) return null;
  return (
    <select aria-label="Parser" value={mode} disabled={disabled} onChange={e => setMode(e.target.value as ParserMode)}
      className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-foreground">
      <option value="quick">Quick (in browser)</option>
      <option value="docling">Docling: tables &amp; layout</option>
      <option value="docling-math">Docling + maths (slow)</option>
    </select>
  );
}
