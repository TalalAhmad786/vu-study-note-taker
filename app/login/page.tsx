import { Suspense } from 'react';
import { PageLoading } from '@/components/page-loading';
import { LoginForm } from './login-form';

async function LoginPageBody({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">VU Study</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in with a magic link sent to your email.</p>
      <LoginForm initialError={error} />
    </main>
  );
}

export default function LoginPage(props: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading" />}>
      <LoginPageBody {...props} />
    </Suspense>
  );
}
