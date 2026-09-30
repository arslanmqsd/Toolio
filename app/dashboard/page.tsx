import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
      <p className="mt-8 max-w-xl text-sm text-[color:var(--text-muted)]">
        Your favorite tools, recent history and saved snippets will show up here.
      </p>
    </main>
  );
}
