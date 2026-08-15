import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogPicker } from "@/components/LogPicker";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log a visit" };
export const dynamic = "force-dynamic";

/**
 * The centre tab. Search for where you ate, tap it, log it — the sheet opens on
 * the same screen so there is no navigation between choosing and recording.
 */
export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="display text-3xl">Where did you eat?</h1>
      <p className="mt-2 text-dim">
        Search for the place. You can log meals from months ago — the date is
        yours to set.
      </p>

      <div className="mt-6">
        <LogPicker />
      </div>
    </div>
  );
}
