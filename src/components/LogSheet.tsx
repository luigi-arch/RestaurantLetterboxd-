"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StarPicker } from "@/components/StarPicker";
import { OCCASIONS } from "@/lib/cuisine";
import { createClient } from "@/lib/supabase/client";

/**
 * The log sheet.
 *
 * If this takes longer than about fifteen seconds it will not become a habit,
 * and nothing else in the product matters. So the required set is two fields —
 * the date, pre-filled to today, and whether you would go back. Everything else
 * is folded away behind "Add more".
 *
 * The rating is optional deliberately: forcing a score suppresses logging, and
 * a visit with no rating is still worth recording.
 */
type Props = {
  restaurantId: string;
  restaurantName: string;
  localityName?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function LogSheet({
  restaurantId,
  restaurantName,
  localityName,
  onClose,
  onSaved,
}: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [visitedOn, setVisitedOn] = useState(today);
  const [rating, setRating] = useState<number | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [pricePerHead, setPricePerHead] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes, and the page behind must not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  async function save() {
    if (wouldReturn === null) {
      setError("Just the one question left — would you go back?");
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

    await supabase.rpc("rl_ensure_profile");

    const { error: insertError } = await supabase.from("rl_visits").insert({
      user_id: user.id,
      restaurant_id: restaurantId,
      visited_on: visitedOn,
      rating,
      would_return: wouldReturn,
      note: note.trim() || null,
      price_per_head: pricePerHead ? Number(pricePerHead) : null,
      occasion,
      is_public: isPublic,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigator.vibrate?.([10, 40, 20]);
    setSaved(true);

    // Let the confirmation land before returning to the page underneath.
    setTimeout(() => {
      onSaved?.();
      router.refresh();
      onClose();
    }, 1300);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="fade-in absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Log a visit to ${restaurantName}`}
        className="sheet-up relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-bg p-5 sm:rounded-3xl"
      >
        {saved ? (
          <SavedConfirmation restaurantName={restaurantName} />
        ) : (
          <>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-subtle sm:hidden" />

            <header className="mb-5">
              <p className="label">Logging a visit</p>
              <h2 className="display mt-1 text-3xl leading-tight">
                {restaurantName}
              </h2>
              {localityName && (
                <p className="mt-1 text-sm text-faint">{localityName}</p>
              )}
            </header>

            <div className="space-y-6">
              <div>
                <p className="label mb-2">How was it?</p>
                <StarPicker value={rating} onChange={setRating} />
                <p className="mt-1.5 text-xs text-faint">
                  Optional — tap the same star again to clear it.
                </p>
              </div>

              {/* The one required judgement, and deliberately softer than a star
                  rating: declining to return is easier to say honestly than
                  giving one star to someone you might run into. */}
              <div>
                <p className="label mb-2">Would you go back?</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWouldReturn(true)}
                    className={`press rounded-2xl border px-4 py-3.5 font-medium ${
                      wouldReturn === true
                        ? "border-success bg-success/12 text-success"
                        : "hover:border-success/50"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWouldReturn(false)}
                    className={`press rounded-2xl border px-4 py-3.5 font-medium ${
                      wouldReturn === false
                        ? "border-danger bg-danger/12 text-danger"
                        : "hover:border-danger/50"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              <div>
                <label className="label mb-2 block">When</label>
                <input
                  type="date"
                  value={visitedOn}
                  max={today}
                  onChange={(e) => setVisitedOn(e.target.value)}
                  className="w-full rounded-2xl border bg-surface px-4 py-3 outline-none focus:border-accent"
                />
              </div>

              {!showMore ? (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="text-sm text-accent hover:underline"
                >
                  Add notes, price or occasion
                </button>
              ) : (
                <div className="fade-in space-y-5">
                  <div>
                    <label className="label mb-2 block">Notes</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="What you ate, who you were with…"
                      className="w-full rounded-2xl border bg-surface px-4 py-3 outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="label mb-2 block">€ per head</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={pricePerHead}
                      onChange={(e) => setPricePerHead(e.target.value)}
                      placeholder="—"
                      className="w-32 rounded-2xl border bg-surface px-4 py-3 outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <p className="label mb-2">Occasion</p>
                    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                      {OCCASIONS.map(({ label, emoji }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setOccasion(occasion === label ? null : label)
                          }
                          className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
                            occasion === label
                              ? "border-accent bg-accent/10 text-accent"
                              : "text-dim"
                          }`}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={!isPublic}
                      onChange={(e) => setIsPublic(!e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Keep this private
                      <span className="mt-0.5 block text-xs text-faint">
                        Your name comes off it. The rating still counts towards
                        this restaurant&apos;s score.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="sticky bottom-0 -mx-5 border-t bg-bg px-5 pt-4 pb-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="press w-full rounded-2xl bg-accent px-4 py-3.5 font-medium text-bg disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add to diary"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SavedConfirmation({ restaurantName }: { restaurantName: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="star-pop flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-success" aria-hidden="true">
          <path
            d="m5 12.5 4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <h2 className="display mt-5 text-3xl">{restaurantName}</h2>
      <p className="mt-2 text-dim">Added to your diary ✨</p>
      <p className="mt-1 text-sm text-faint">One more filled in on your map.</p>
    </div>
  );
}
