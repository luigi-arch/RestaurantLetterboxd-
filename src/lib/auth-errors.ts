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
  /** Whether trying again straight away is likely to help. */
  retryable: boolean;
};

const FALLBACK: FriendlyAuthError = {
  title: "Sign-in did not complete",
  detail: "Something went wrong. Try again, or use a password instead.",
  retryable: true,
};

export function friendlyAuthError(raw: string | undefined): FriendlyAuthError | null {
  if (!raw) return null;
  const message = raw.toLowerCase();

  // Supabase's built-in email service allows only a couple of messages per hour,
  // and the quota belongs to the whole project — which this app shares with
  // another product. Password sign-in avoids email entirely.
  if (message.includes("rate limit") || message.includes("too many")) {
    return {
      title: "Email limit reached",
      detail:
        "The built-in mail service only sends a couple of messages an hour. " +
        "Use a password instead — it works straight away and needs no email.",
      retryable: false,
    };
  }

  // The verifier lives in a cookie set when the link was requested. It is
  // missing when the link is opened somewhere else, or when it predates a
  // deployment that changed the flow.
  if (message.includes("code verifier") || message.includes("pkce")) {
    return {
      title: "That link was opened somewhere else",
      detail:
        "Sign-in links only work in the browser that asked for them, and only once. " +
        "If your email app opened this in its own window, request a fresh one — or " +
        "use a password instead.",
      retryable: true,
    };
  }

  if (message.includes("expired")) {
    return {
      title: "That link has expired",
      detail: "Sign-in links last an hour. Request a new one, or use a password.",
      retryable: true,
    };
  }

  if (message.includes("already been used")) {
    return {
      title: "That link has already been used",
      detail: "Each link works once. Request a new one, or use a password.",
      retryable: true,
    };
  }

  if (message.includes("missing_code")) {
    return {
      title: "That link was incomplete",
      detail:
        "The address was missing its sign-in code — some email clients trim long links. " +
        "Open the next one by tapping rather than copying, or use a password.",
      retryable: true,
    };
  }

  // ---- Password paths -----------------------------------------------------

  if (message.includes("invalid login credentials")) {
    return {
      title: "That email and password did not match",
      detail:
        "Check both, or create an account if you have not made one yet.",
      retryable: true,
    };
  }

  if (message.includes("already registered") || message.includes("already exists")) {
    return {
      title: "You already have an account",
      detail: "Sign in with your password instead of creating a new account.",
      retryable: true,
    };
  }

  if (message.includes("password should be") || message.includes("password must")) {
    return {
      title: "That password is too short",
      detail: "Use at least eight characters.",
      retryable: true,
    };
  }

  if (message.includes("email not confirmed")) {
    return {
      title: "Your email is not confirmed yet",
      detail:
        "Check your inbox for the confirmation link. If it never arrives, email " +
        "confirmation can be switched off in the Supabase dashboard.",
      retryable: false,
    };
  }

  if (message.includes("signups not allowed") || message.includes("signup is disabled")) {
    return {
      title: "New accounts are turned off",
      detail: "Sign-ups are disabled for this project at the moment.",
      retryable: false,
    };
  }

  return FALLBACK;
}
