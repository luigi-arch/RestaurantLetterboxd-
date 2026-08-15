import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes sign-in, then makes sure the diner has a profile.
 *
 * Supabase can deliver a magic link in two shapes, and this handles both:
 *
 *   ?code=…        PKCE. Requires the code-verifier cookie set when the link was
 *                  requested, so it only works in the same browser. This is the
 *                  default and the more secure of the two.
 *
 *   ?token_hash=…  Direct verification, needing nothing from local storage, so
 *                  it survives the link being opened in the email client's own
 *                  browser. Sent when the email template uses {{ .TokenHash }}.
 *
 * Trying token_hash first costs nothing and turns the most common magic-link
 * failure — "opened in a different browser" — into a non-event wherever the
 * template provides it.
 *
 * Profile creation is a function call rather than a trigger on auth.users
 * because this app shares a Supabase project with an unrelated production
 * system, where a throwing trigger would abort that system's signups too.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/diary";

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const failure = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  if (!code && !tokenHash) return failure("missing_code");

  const supabase = await createClient();

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type ?? "email",
      })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) return failure(error.message);

  // Idempotent: safe on every sign-in, not only the first.
  const { error: profileError } = await supabase.rpc("rl_ensure_profile");
  if (profileError) return failure(profileError.message);

  return NextResponse.redirect(`${origin}${next}`);
}
