"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogSheet } from "@/components/LogSheet";
import { createClient } from "@/lib/supabase/client";

/**
 * Visited · Want to visit · Share.
 *
 * "Visited" opens the log sheet in place rather than navigating, so the decision
 * to log and the act of logging are the same gesture.
 */
export function RestaurantActions({
  restaurantId,
  restaurantName,
  localityName,
  signedIn,
  initiallyWishlisted,
  shareUrl,
}: {
  restaurantId: string;
  restaurantName: string;
  localityName: string | null;
  signedIn: boolean;
  initiallyWishlisted: boolean;
  shareUrl: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [shareLabel, setShareLabel] = useState("Share");

  async function toggleWishlist() {
    if (!signedIn) {
      router.push("/login");
      return;
    }

    // Optimistic: the round trip is slower than the intent.
    const next = !wishlisted;
    setWishlisted(next);
    navigator.vibrate?.(6);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc("rl_ensure_profile");

    const { error } = next
      ? await supabase
          .from("rl_wishlist")
          .upsert({ user_id: user.id, restaurant_id: restaurantId })
      : await supabase
          .from("rl_wishlist")
          .delete()
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId);

    if (error) setWishlisted(!next); // put it back
    else router.refresh();
  }

  async function share() {
    const data = {
      title: restaurantName,
      text: `${restaurantName}${localityName ? `, ${localityName}` : ""}`,
      url: shareUrl,
    };

    // Native share sheet where available; clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // Dismissed — fall through to copying.
      }
    }

    await navigator.clipboard?.writeText(shareUrl);
    setShareLabel("Copied");
    setTimeout(() => setShareLabel("Share"), 1600);
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => (signedIn ? setSheetOpen(true) : router.push("/login"))}
          className="press rounded-2xl bg-accent px-3 py-3 text-sm font-medium text-bg"
        >
          Visited
        </button>

        <button
          type="button"
          onClick={toggleWishlist}
          aria-pressed={wishlisted}
          className={`press rounded-2xl border px-3 py-3 text-sm font-medium ${
            wishlisted ? "border-accent bg-accent/10 text-accent" : "text-dim"
          }`}
        >
          {wishlisted ? "On your list" : "Want to visit"}
        </button>

        <button
          type="button"
          onClick={share}
          className="press rounded-2xl border px-3 py-3 text-sm font-medium text-dim"
        >
          {shareLabel}
        </button>
      </div>

      {sheetOpen && (
        <LogSheet
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          localityName={localityName}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
