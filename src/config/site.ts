/**
 * The canonical origin for auth redirects.
 *
 * Magic links must come back to ONE known origin. Using
 * `window.location.origin` seems reasonable until you notice that Vercel serves
 * the same app from a production domain, a `git-main` alias, and a fresh
 * hostname for every preview deployment — each of which would need its own
 * entry in Supabase's redirect allow-list, and any missing one fails silently
 * by falling back to the project's Site URL.
 *
 * Pinning the origin means the allow-list needs one production entry plus
 * localhost, and a link clicked from a preview build still lands somewhere that
 * works.
 *
 * Override with NEXT_PUBLIC_SITE_URL when the domain changes.
 */
const CANONICAL_PRODUCTION_ORIGIN = "https://mejda-luigi-archs-projects.vercel.app";

export function authRedirectOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Local development: come back to the dev server, not production.
  if (
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
  ) {
    return window.location.origin;
  }

  return CANONICAL_PRODUCTION_ORIGIN;
}
