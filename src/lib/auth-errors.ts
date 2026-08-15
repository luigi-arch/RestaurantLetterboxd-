/**
 * Turns Supabase auth failures into something a diner can act on.
 *
 * The raw messages are written for developers — the PKCE one advises the reader
 * to "use @supabase/ssr on both the server and client", which is useless and
 * slightly alarming when it appears on a sign-in page. Each case here is mapped
 * to what the person should actually do, with the original kept for debugging.
 */

export type FriendlyAuthError = {
  title: string;
  detail: string;
  /** Whether requesting a fresh link is the fix. */
  retryable: boolean;
};

const FALLBACK: FriendlyAuthError = {
  title: "Sign-in did not complete",
  detail: "Something went wrong with that link. Request a new one below.",
  retryable: true,
};

export function friendlyAuthError(raw: string | undefined): FriendlyAuthError | null {
  if (!raw) return null;
  const message = raw.toLowerCase();

  // The verifier lives in a cookie set when the link was requested. It is
  // missing when the link is opened somewhere else, or when it predates a
  // deployment that changed the flow.
  if (message.includes("code verifier") || message.includes("pkce")) {
    return {
      title: "That link was opened somewhere else",
      detail:
        "Sign-in links only work in the browser that asked for them, and only once. " +
        "If your email app opened this in its own window, or the link has been sitting " +
        "around a while, request a fresh one below and open it in this browser.",
      retryable: true,
    };
  }

  if (message.includes("expired") || message.includes("otp_expired")) {
    return {
      title: "That link has expired",
      detail: "Sign-in links last an hour. Request a new one below.",
      retryable: true,
    };
  }

  if (message.includes("already been used") || message.includes("used")) {
    return {
      title: "That link has already been used",
      detail: "Each link works once. Request a new one below.",
      retryable: true,
    };
  }

  if (message.includes("missing_code")) {
    return {
      title: "That link was incomplete",
      detail:
        "The address was missing the sign-in code — some email clients trim long links. " +
        "Try requesting another, and open it by tapping rather than copying.",
      retryable: true,
    };
  }

  if (message.includes("rate") || message.includes("too many")) {
    return {
      title: "Too many attempts",
      detail: "Wait a minute or two before requesting another link.",
      retryable: false,
    };
  }

  return FALLBACK;
}
