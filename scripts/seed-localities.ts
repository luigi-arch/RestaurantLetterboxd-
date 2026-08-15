/**
 * Seeds the localities table for the active market.
 *
 * Deliberately offline: localities are a small, stable reference set, and the
 * catalogue should not depend on a third-party API being up to bootstrap.
 * Centroids are left null here and derived from restaurant positions by
 * seed-restaurants.ts, which is more accurate than guessing them.
 *
 *   npm run seed:localities
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { ACTIVE_MARKET } from "../src/config/market";
import { createAdminClient } from "../src/lib/supabase/admin";

type LocalityRecord = {
  name: string;
  island: string;
  aliases?: string[];
};

type LocalityFile = {
  region: string;
  localities: LocalityRecord[];
};

async function main() {
  const file = path.join(process.cwd(), "data", "malta-localities.json");
  const parsed = JSON.parse(await readFile(file, "utf8")) as LocalityFile;

  if (parsed.region !== ACTIVE_MARKET.key) {
    throw new Error(
      `Locality file is for region "${parsed.region}" but the active market is ` +
        `"${ACTIVE_MARKET.key}". Refusing to mix markets.`,
    );
  }

  const supabase = createAdminClient();

  const rows = parsed.localities.map((locality) => ({
    region: parsed.region,
    name: locality.name,
    // The island reads as an alias too, so "Gozo" narrows a search usefully.
    aliases: [...(locality.aliases ?? []), locality.island === "gozo" ? "Gozo" : "Malta"],
  }));

  const { error } = await supabase
    .from("localities")
    .upsert(rows, { onConflict: "region,name" });

  if (error) throw error;

  console.log(`Seeded ${rows.length} localities for ${ACTIVE_MARKET.name}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
