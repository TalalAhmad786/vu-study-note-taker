// size/overlap in characters ≈ 700/100 tokens
export function chunkText(text: string, header: string, size = 2800, overlap = 400): string[] {
  // Split on paragraph breaks first so a chunk never cuts a sentence in half;
  // fall back to sentence splitting for paragraphs longer than one chunk.
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).flatMap(p => splitLong(p, size));
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > size && buf) {
      chunks.push(buf);
      buf = tail(buf, overlap) + '\n\n' + p;   // carry the tail forward
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.map(c => `${header}\n\n${c}`);
}

function splitLong(para: string, size: number): string[] {
  if (para.length <= size) return [para];
  // Transcripts often arrive as one giant paragraph with single newlines.
  const sentences = para.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [para];
  const out: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > size) {
      if (buf) { out.push(buf); buf = ''; }
      for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
      continue;
    }
    if ((buf + ' ' + s).length > size && buf) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// Last `n` characters, starting at a word boundary.
function tail(s: string, n: number) {
  if (s.length <= n) return s;
  const cut = s.slice(-n);
  const space = cut.indexOf(' ');
  return space > 0 && space < 80 ? cut.slice(space + 1) : cut;
}
