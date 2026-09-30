import type { Metadata } from "next";
import SignInButton from "@/components/auth/SignInButton";
import PageTitle from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "Sign-in link didn't work",
  robots: { index: false },
};

export default function AuthErrorPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <PageTitle>That sign-in link didn&apos;t work</PageTitle>
      <p className="mt-3 text-[color:var(--text-muted)]">Sign-in links fail when they are:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[color:var(--text-muted)]">
        <li>more than an hour old,</li>
        <li>already used, or</li>
        <li>opened in a different browser from the one that asked for them.</li>
      </ul>
      <p className="mt-4 text-[color:var(--text-muted)]">Request a new one here, then open it in this browser.</p>
      <div className="mt-6">
        <SignInButton label="Sign in again" />
      </div>
    </main>
  );
}
