/**
 * scripts/recompute-graph.ts
 *
 * One-shot script to compute and persist graph layouts for all published variants.
 * Run after seeding people + relationships.
 *
 * Usage: npx tsx scripts/recompute-graph.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Patch process.env so @/lib modules see the values
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

import { recomputeGraphLayout } from "../lib/graph-recompute";

async function main() {
  console.log("Computing graph layouts...");
  const results = await recomputeGraphLayout();
  for (const r of results) {
    console.log(`  ✓ variant=${r.variant}  nodes=${r.nodeCount}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
