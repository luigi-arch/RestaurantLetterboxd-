"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = { status: "idle" | "sending" | "sent" | "error"; message?: string };

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState({ status: "sending" });

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        // Must be an allowed redirect URL in the Supabase Auth settings, or the
        // link lands the user back on the site logged out with no explanation.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }
    setState({ status: "sent" });
  }

  if (state.status === "sent") {
    return (
      <div className="rounded-lg border bg-surface p-4 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-muted">
          We sent a sign-in link to <span className="text-foreground">{email}</span>.
          It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-muted">Email</span>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={state.status === "sending"}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {state.status === "sending" ? "Sending…" : "Send me a link"}
      </button>

      {state.status === "error" && (
        <p className="text-sm text-balcony-red">{state.message}</p>
      )}
    </form>
  );
}
