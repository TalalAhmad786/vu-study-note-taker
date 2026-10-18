// Pull a "## Heading" section (up to the next ## heading) out of generated notes markdown.
export function section(markdown: string, heading: string) {
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
  const m = re.exec(markdown);
  if (!m) return '';
  const rest = markdown.slice(m.index + m[0].length);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

// Split model output into the markdown notes and the trailing ```json meta block.
export function splitNotesOutput(text: string) {
  const fence = /```json\s*([\s\S]*?)```\s*$/;
  const m = fence.exec(text.trim());
  if (!m) return { markdown: text.trim(), json: null as string | null };
  return { markdown: text.trim().slice(0, m.index).trim(), json: m[1] };
}
