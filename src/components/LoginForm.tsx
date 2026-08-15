"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authRedirectOrigin } from "@/config/site";
import { friendlyAuthError, type FriendlyAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

/**
 * Password sign-in is the default, with magic links as a secondary option.
 *
 * That ordering is deliberate. Supabase's built-in mail service sends only a
 * couple of messages an hour, and the quota belongs to the whole project — which
 * this app shares with another product. Magic links are the nicer experience
 * right up until the second person tries to sign up.
 *
 * Passwords need no email, no redirect allow-list and no PKCE verifier, so they
 * sidestep every failure mode this flow has hit.
 */
type Mode = "password" | "magic";
type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "sent" }
  | { kind: "confirm" }
  | { kind: "error"; error: FriendlyAuthError; raw: string };

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "busy";

  function fail(raw: string) {
    setStatus({ kind: "error", error: friendlyAuthError(raw)!, raw });
  }

  /** Lands the diner in their diary once a session exists. */
  async function completeSignIn() {
    // Creates the profile if this is a first sign-in; safe to repeat.
    await createClient().rpc("rl_ensure_profile");
    router.refresh();
    router.push("/diary");
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "busy" });

    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) return fail(error.message);
    await completeSignIn();
  }

  async function signUp() {
    setStatus({ kind: "busy" });

    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${authRedirectOrigin()}/auth/callback` },
    });

    if (error) return fail(error.message);

    // With email confirmation switched off Supabase returns a session straight
    // away. With it on, the account exists but needs the emailed link first.
    if (data.session) return completeSignIn();
    setStatus({ kind: "confirm" });
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "busy" });

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${authRedirectOrigin()}/auth/callback` },
    });

    if (error) return fail(error.message);
    setStatus({ kind: "sent" });
  }

  if (status.kind === "sent") {
    return (
      <Notice title="Check your email">
        We sent a sign-in link to <span className="text-foreground">{email}</span>.
        Open it in this browser — it expires in an hour.
      </Notice>
    );
  }

  if (status.kind === "confirm") {
    return (
      <Notice title="Almost there">
        Your account is created. Confirm{" "}
        <span className="text-foreground">{email}</span> using the link we just
        sent, then come back and sign in.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={mode === "password" ? signIn : sendMagicLink} className="space-y-3">
        <label className="block">
          <span className="text-sm text-muted">Email</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>

        {mode === "password" && (
          <label className="block">
            <span className="text-sm text-muted">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1 w-full rounded-md border bg-surface px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-3 py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? "Just a moment…"
            : mode === "password"
              ? "Sign in"
              : "Send me a link"}
        </button>

        {mode === "password" && (
          <button
            type="button"
            disabled={busy}
            onClick={signUp}
            className="w-full rounded-md border px-3 py-2 font-medium hover:border-accent disabled:opacity-50"
          >
            Create an account
          </button>
        )}
      </form>

      {status.kind === "error" && (
        <div className="rounded-lg border border-balcony-red/40 bg-balcony-red/10 p-3 text-sm">
          <p className="font-medium text-balcony-red">{status.error.title}</p>
          <p className="mt-1 text-muted">{status.error.detail}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-faint hover:text-muted">
              Technical detail
            </summary>
            <p className="mt-1 font-mono text-[11px] break-words text-faint">
              {status.raw}
            </p>
          </details>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setStatus({ kind: "idle" });
        }}
        className="text-sm text-accent hover:underline"
      >
        {mode === "password"
          ? "Email me a link instead"
          : "Use a password instead"}
      </button>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface p-4 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted">{children}</p>
    </div>
  );
}
