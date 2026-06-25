#!/usr/bin/env npx tsx
/**
 * scripts/gallica/warm-issues-cache.ts
 *
 * Pre-fetch Gallica Issues service XML for all serialization years (1844–1846)
 * and write to content/gallica/issues-{year}.xml on disk.
 *
 * Usage:
 *   npx tsx scripts/gallica/warm-issues-cache.ts
 *   npx tsx scripts/gallica/warm-issues-cache.ts --refresh-gallica-cache
 */

import "dotenv/config";
import { getAll } from "../../lib/installments";
import { DEBATS_PERIODICAL_ARK, warmIssuesCache } from "../../lib/gallica";
import { REFRESH_GALLICA_CACHE } from "./_shared";

async function main() {
  const years = [
    ...new Set(getAll().map((inst) => parseInt(inst.date.slice(0, 4), 10))),
  ].sort();

  console.log(
    `[warm-issues-cache] Fetching Issues XML for years: ${years.join(", ")}`,
  );

  const results = await warmIssuesCache(DEBATS_PERIODICAL_ARK, years, {
    refresh: REFRESH_GALLICA_CACHE,
  });

  console.log(JSON.stringify({ ok: true, years: results }));
}

main().catch((err) => {
  console.error("[warm-issues-cache] Unexpected error:", err);
  process.exit(1);
});
