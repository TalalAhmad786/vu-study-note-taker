import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { getUser } from "@/lib/auth";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VU Study",
  description: "Exam-focused notes, course Q&A, quizzes and revision sheets for Virtual University lectures",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <header className="no-print border-b">
          <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="font-semibold tracking-tight">VU Study</Link>
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="hidden sm:inline">{user.email}</span>
      <button type="submit" className="hover:text-foreground">Sign out</button>
    </form>
  );
}
