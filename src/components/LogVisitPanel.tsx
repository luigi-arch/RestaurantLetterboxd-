"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The log sheet. If this takes longer than about fifteen seconds it will not
 * become a habit, and nothing else in the product matters.
 *
 * Only two fields are required: the date (pre-filled to today) and whether you
 * would return. The star rating is optional on purpose — forcing a score
 * suppresses logging, and a visit with no rating is still worth recording.
 */
export function LogVisitPanel({
  restaurantId,
  restaurantName,
  signedIn,
}: {
  restaurantId: string;
  restaurantName: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [visitedOn, setVisitedOn] = useState(today);
  const [rating, setRating] = useState<number | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [pricePerHead, setPricePerHead] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  if (!signedIn) {
    return (
      <div className="rounded-lg border bg-surface p-4 text-sm">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>{" "}
        <span className="text-muted">to log a meal at {restaurantName}.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-background hover:opacity-90"
      >
        Log a visit
      </button>
    );
  }

  async function save() {
    if (wouldReturn === null) {
      setError("Let us know whether you would go back — it is the one thing we ask.");
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    // Safe to call repeatedly; creates the profile only if it is missing.
    await supabase.rpc("rl_ensure_profile");

    const { error: insertError } = await supabase.from("rl_visits").insert({
      user_id: user.id,
      restaurant_id: restaurantId,
      visited_on: visitedOn,
      rating,
      would_return: wouldReturn,
      note: note.trim() || null,
      price_per_head: pricePerHead ? Number(pricePerHead) : null,
      is_public: isPublic,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOpen(false);
    setNote("");
    setRating(null);
    setWouldReturn(null);
    setPricePerHead("");
    // A trigger recomputes this restaurant's stats, so refresh picks them up.
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-semibold">Log a visit</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-faint hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="text-xs text-muted">When</span>
            <input
              type="date"
              value={visitedOn}
              max={today}
              onChange={(e) => setVisitedOn(e.target.value)}
              className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">€ per head (optional)</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={pricePerHead}
              onChange={(e) => setPricePerHead(e.target.value)}
              placeholder="—"
              className="mt-1 block w-28 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div>
          <span className="text-xs text-muted">Rating (optional)</span>
          <div className="mt-1 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className="relative inline-flex">
                {/* Two half-width hit areas per star give half-star input
                    without a fiddly slider. */}
                <button
                  type="button"
                  aria-label={`${star - 0.5} stars`}
                  onClick={() => setRating(star - 0.5)}
                  className="absolute left-0 z-10 h-full w-1/2"
                />
                <button
                  type="button"
                  aria-label={`${star} stars`}
                  onClick={() => setRating(star)}
                  className="absolute right-0 z-10 h-full w-1/2"
                />
                <span
                  className={`text-3xl leading-none ${
                    rating !== null && rating >= star - 0.5
                      ? "text-gold"
                      : "text-faint"
                  }`}
                >
                  {rating !== null && rating === star - 0.5 ? "⯨" : "★"}
                </span>
              </span>
            ))}
            <span className="ml-2 text-sm text-muted tabular">
              {rating !== null ? rating.toFixed(1) : "—"}
            </span>
            {rating !== null && (
              <button
                type="button"
                onClick={() => setRating(null)}
                className="ml-1 text-xs text-faint hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* The one required judgement. Deliberately softer than a star rating:
            declining to return is easier to say honestly than giving one star,
            which matters on an island where you might know the owner. */}
        <div>
          <span className="text-xs text-muted">Would you go back?</span>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setWouldReturn(true)}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                wouldReturn === true
                  ? "border-balcony-green bg-balcony-green/15 text-balcony-green"
                  : "hover:border-balcony-green/60"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setWouldReturn(false)}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                wouldReturn === false
                  ? "border-balcony-red bg-balcony-red/15 text-balcony-red"
                  : "hover:border-balcony-red/60"
              }`}
            >
              No
            </button>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-muted">Notes (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What you ate, who you were with, whether you'd bring someone…"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!isPublic}
            onChange={(e) => setIsPublic(!e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-foreground">Keep this entry private</span>
            <span className="block text-xs text-faint">
              Your name comes off it, but the rating still counts towards this
              restaurant&apos;s score.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-balcony-red">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save to diary"}
        </button>
      </div>
    </div>
  );
}
