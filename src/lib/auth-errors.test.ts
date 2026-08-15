import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";

describe("friendlyAuthError", () => {
  it("returns null when there is no error", () => {
    expect(friendlyAuthError(undefined)).toBeNull();
    expect(friendlyAuthError("")).toBeNull();
  });

  it("translates the PKCE message without leaking developer advice", () => {
    // The real message tells the reader to "use @supabase/ssr on both the
    // server and client", which is meaningless to a diner signing in.
    const raw =
      "PKCE code verifier not found in storage. This can happen if the auth flow " +
      "was initiated in a different browser or device, or if the storage was cleared. " +
      "For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the " +
      "server and client to store the code verifier in cookies.";

    const friendly = friendlyAuthError(raw)!;

    expect(friendly.title).toBe("That link was opened somewhere else");
    expect(friendly.retryable).toBe(true);
    expect(friendly.detail).not.toMatch(/supabase|pkce|ssr|storage/i);
    expect(friendly.detail).toMatch(/request a fresh one/i);
  });

  it.each([
    ["Email link is invalid or has expired", "That link has expired"],
    ["otp_expired", "That link has expired"],
    ["Token has already been used", "That link has already been used"],
    ["missing_code", "That link was incomplete"],
  ])("maps %s", (raw, expectedTitle) => {
    expect(friendlyAuthError(raw)!.title).toBe(expectedTitle);
  });

  it("marks rate limiting as not worth retrying immediately", () => {
    const friendly = friendlyAuthError("For security purposes, too many requests")!;
    expect(friendly.retryable).toBe(false);
  });

  it("falls back to something actionable for anything unrecognised", () => {
    const friendly = friendlyAuthError("some novel backend failure 0x21")!;
    expect(friendly.title).toBe("Sign-in did not complete");
    expect(friendly.detail).toMatch(/request a new one/i);
  });

  it("never returns the raw message as the user-facing detail", () => {
    // The raw text stays available for debugging, but must not be the copy shown.
    const rawMessages = [
      "PKCE code verifier not found in storage",
      "otp_expired",
      "missing_code",
      "unexpected_failure",
    ];
    for (const raw of rawMessages) {
      expect(friendlyAuthError(raw)!.detail).not.toBe(raw);
    }
  });
});
