import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PasswordForm from "@/components/auth/PasswordForm";
import DashboardSection from "@/components/dashboard/DashboardSection";
import FavoriteTools from "@/components/dashboard/FavoriteTools";
import RecentActivity from "@/components/dashboard/RecentActivity";
import SavedSnippets from "@/components/dashboard/SavedSnippets";
import PageTitle from "@/components/ui/PageTitle";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default async function DashboardPage() {
  if (!hasSupabaseEnv) redirect("/");
  // getClaims verifies the token's signature; never trust getSession on the server.
  const { data } = await createClient().auth.getClaims();
  if (!data?.claims) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle>Dashboard</PageTitle>
      <p className="mt-2 text-[color:var(--text-muted)]">
        Signed in as <span className="text-[color:var(--text)]">{String(data.claims.email ?? "")}</span>
      </p>

      <div className="mt-10 space-y-12">
        <FavoriteTools />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <RecentActivity />
          <SavedSnippets />
        </div>
        {/* A "Forgot password?" reset link lands here (see RESET_PASSWORD_PATH in SignInDialog). */}
        <DashboardSection
          id="password"
          title="Password"
          description="Set a password to sign in without waiting for an email link, or change the one you have."
        >
          <PasswordForm />
        </DashboardSection>
      </div>
    </main>
  );
}
