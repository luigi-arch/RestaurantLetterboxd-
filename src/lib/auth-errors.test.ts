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
    // Always leave a next step, and the password route is the one that does not
    // depend on email delivery.
    expect(friendly.detail).toMatch(/try again|password/i);
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

describe("friendlyAuthError — email limits and passwords", () => {
  it("points at passwords when the email quota is spent", () => {
    // Supabase's built-in mail service caps at a couple of messages an hour,
    // and the quota is shared with the other app in this project.
    const friendly = friendlyAuthError("email rate limit exceeded")!;
    expect(friendly.title).toBe("Email limit reached");
    expect(friendly.retryable).toBe(false);
    expect(friendly.detail).toMatch(/password/i);
  });

  it.each([
    ["Invalid login credentials", "That email and password did not match"],
    ["User already registered", "You already have an account"],
    ["Password should be at least 6 characters", "That password is too short"],
    ["Email not confirmed", "Your email is not confirmed yet"],
    ["Signups not allowed for this instance", "New accounts are turned off"],
  ])("maps %s", (raw, expectedTitle) => {
    expect(friendlyAuthError(raw)!.title).toBe(expectedTitle);
  });
});
