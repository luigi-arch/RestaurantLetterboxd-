import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the magic-link code for a session, then makes sure the diner has a
 * profile.
 *
 * Profile creation is a function call rather than a trigger on auth.users
 * because this app shares a Supabase project with an unrelated production
 * system — a throwing trigger there would abort that system's signups too.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/diary";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Idempotent: safe to call on every sign-in, not just the first.
  const { error: profileError } = await supabase.rpc("rl_ensure_profile");
  if (profileError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(profileError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
