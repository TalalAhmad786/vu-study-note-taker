import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That course or lecture doesn’t exist, or it isn’t yours.</p>
      <Link href="/" className="text-sm underline">Back to your courses</Link>
    </main>
  );
}
