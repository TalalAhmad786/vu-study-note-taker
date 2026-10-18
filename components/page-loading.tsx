export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="h-7 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/60" />)}
      </div>
      <span className="sr-only">{label}</span>
    </main>
  );
}
