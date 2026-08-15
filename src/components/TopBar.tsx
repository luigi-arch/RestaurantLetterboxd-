import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { BRAND } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";

/**
 * Desktop navigation. Hidden on mobile, where the bottom tab bar takes over.
 * On mobile only the wordmark remains, so the feed starts as high as possible.
 */
export async function TopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center gap-6 px-5 py-3.5">
        <Link href="/" className="display text-xl">
          {BRAND.name}
        </Link>

        <nav className="ml-auto hidden items-center gap-6 text-sm md:flex">
          <Link href="/discover" className="text-dim hover:text-text">
            Discover
          </Link>
          <Link href="/map" className="text-dim hover:text-text">
            Map
          </Link>
          {user ? (
            <>
              <Link href="/me" className="text-dim hover:text-text">
                Me
              </Link>
              <Link
                href="/log"
                className="press rounded-full bg-accent px-4 py-1.5 font-medium text-bg"
              >
                Log a visit
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="press rounded-full bg-accent px-4 py-1.5 font-medium text-bg"
            >
              Sign in
            </Link>
          )}
        </nav>

        {!user && (
          <Link
            href="/login"
            className="press ml-auto rounded-full border px-3.5 py-1.5 text-sm font-medium md:hidden"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
