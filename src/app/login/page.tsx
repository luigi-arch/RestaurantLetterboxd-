import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { BRAND } from "@/config/brand";
import { friendlyAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/diary");

  const friendly = friendlyAuthError(error);

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="font-display text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Use the same email each time and your diary follows you. New to{" "}
        {BRAND.name}? Pick a password and create an account.
      </p>

      {friendly && (
        <div className="mt-4 rounded-lg border border-balcony-red/40 bg-balcony-red/10 p-3 text-sm">
          <p className="font-medium text-balcony-red">{friendly.title}</p>
          <p className="mt-1 text-muted">{friendly.detail}</p>
          {/* The raw message is developer-facing — kept, but folded away. */}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-faint hover:text-muted">
              Technical detail
            </summary>
            <p className="mt-1 font-mono text-[11px] break-words text-faint">{error}</p>
          </details>
        </div>
      )}

      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
