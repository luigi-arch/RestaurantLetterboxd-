import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "How ratings work" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-semibold">How ratings work</h1>

      <p className="text-muted">
        Most restaurant ratings are a plain average of every review ever left.
        That works for films — <em>Casablanca</em> is the same film it was in
        1942 — but a restaurant changes chef and dies. A plain average lets a
        glowing review from 2019 defend a kitchen that has been poor for years.
      </p>

      <p className="text-muted">
        {BRAND.name} does three things differently.
      </p>

      <section>
        <h2 className="font-display text-lg font-semibold">Recent opinion counts more</h2>
        <p className="mt-1 text-muted">
          A visit&apos;s influence halves every fifteen months. Old meals never
          disappear, they just quietly stop deciding the score. That is why the
          headline number is labelled <strong>recent rating</strong>, with the
          all-time average kept beside it.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Every diner counts once</h2>
        <p className="mt-1 text-muted">
          However many times you log the same place, you are one voice. Somebody
          logging twenty enthusiastic visits cannot outvote four other people —
          which matters rather a lot on an island where the owner might be
          someone&apos;s cousin.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">
          One perfect score does not top the list
        </h2>
        <p className="mt-1 text-muted">
          Ratings are pulled gently towards the middle until enough people have
          been. A single five-star visit will not outrank fifty
          four-and-a-halfs; a restaurant earns its way up as more diners log.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">
          &ldquo;Would you go back?&rdquo;
        </h2>
        <p className="mt-1 text-muted">
          It is the only thing we insist on. Stars drift upward when you might
          run into the owner at the shop; quietly saying you would not return is
          easier to be honest about. It is also the hardest signal to fake —
          anyone can buy a review, but buying a second real visit is expensive.
          The <strong>return rate</strong> on each restaurant page is the share of
          diners who actually came back.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Private entries</h2>
        <p className="mt-1 text-muted">
          Marking an entry private takes your name off it. The rating still
          counts towards the restaurant&apos;s score, because the candid ones are
          usually the private ones, and throwing them away would leave only the
          polite half.
        </p>
      </section>
    </article>
  );
}
