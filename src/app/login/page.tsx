import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { BRAND } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/diary");

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="font-display text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        {BRAND.name} sends you a link — no password to remember. Use the same
        address each time and your diary follows you.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
