import Link from "next/link";
import { BRAND } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export async function SiteNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          {BRAND.name}
        </Link>

        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/browse" className="text-muted hover:text-foreground">
            Browse
          </Link>

          {user ? (
            <>
              <Link href="/diary" className="text-muted hover:text-foreground">
                Diary
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-background hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
