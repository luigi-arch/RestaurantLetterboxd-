"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Uses the publishable key, so RLS is in force. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
