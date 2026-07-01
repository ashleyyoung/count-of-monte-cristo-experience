/**
 * Patch a single field in the stored overview JSON for a date without making
 * an LLM call. Reads the current R2 object, applies the patch, writes a new
 * R2 key, and updates day_content in Supabase.
 *
 * Usage:
 *   npx tsx scripts/summarize/patch-overview.ts --date=1844-09-04 --lead="New lead text."
 *
 * Supported patch flags:
 *   --lead="..."   Replace the lead sentence (v2 overviews only)
 */

import {
  makeClient,
  persistDayDoc,
  setSectionTextItems,
  ensureLiveTextArchived,
  insertVersionRow,
} from "../../lib/translate/pipeline";
import { parseDayDoc, type TextItem } from "../../lib/types/content";
import { getR2Text, putR2Text } from "../../lib/r2-server";
import { parseParisOverview, extractJsonFromModelOutput } from "../../lib/types/paris-overview";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  }),
);

const date = args["date"];
if (!date) {
  console.error("Usage: patch-overview.ts --date=YYYY-MM-DD --lead=\"...\"");
  process.exit(1);
}

const patches: Record<string, string> = {};
if (args["lead"]) patches["lead"] = args["lead"];

if (Object.keys(patches).length === 0) {
  console.error("No patch flags provided. Use --lead=\"...\" to patch a field.");
  process.exit(1);
}

const supabase = makeClient();

const { data: row, error } = await supabase
  .from("day_content")
  .select("doc")
  .eq("installment_date", date)
  .single();

if (error || !row) {
  console.error(`No day_content row found for ${date}:`, error?.message);
  process.exit(1);
}

let doc = parseDayDoc(row.doc);
const overviewItems = (doc.overview ?? []).filter(
  (i) => i.kind === "text" && i.text_r2_key,
) as TextItem[];

if (overviewItems.length === 0) {
  console.error(`No overview text item found for ${date}.`);
  process.exit(1);
}

const existing = overviewItems[0] as TextItem & { text_r2_key: string };
const currentText = await getR2Text(existing.text_r2_key);
const overview = parseParisOverview(currentText);

if (!overview) {
  console.error("Could not parse existing overview JSON.");
  process.exit(1);
}

if (patches["lead"] !== undefined && overview.version !== 2) {
  console.error(`Overview for ${date} is version ${overview.version}; --lead only applies to v2.`);
  process.exit(1);
}

const patched = { ...overview, ...patches };
const patchedText = JSON.stringify(patched, null, 2);

const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const enKey = `${date}/en/overview-1/${runStamp}.txt`;
await putR2Text(enKey, patchedText);
console.log(`Written to R2: ${enKey}`);

await ensureLiveTextArchived(supabase, date, "overview", existing, console.log);

const versionId = await insertVersionRow(supabase, {
  installment_date: date,
  section: "overview",
  slot_key: "overview-1",
  text_r2_key: enKey,
  source: existing.source ?? "Journal des Débats",
  original_date: date,
  gallica_url: existing.gallica_url ?? "",
  license: existing.license ?? "Public Domain",
  attribution: existing.attribution ?? "Machine summarization",
  model_used: existing.translation_model ?? "manual-patch",
  source_text_url: existing.source_text_url ?? existing.gallica_url ?? "",
  fr_intermediate_r2_key: existing.fr_intermediate_r2_key ?? "",
  cost_usd: 0,
  low_confidence: false,
  admin_notes: `Patched fields: ${Object.keys(patches).join(", ")}`,
});

const updatedItem: TextItem = {
  ...existing,
  text_r2_key: enKey,
  translation_version_id: versionId,
};

doc = setSectionTextItems(doc, "overview", [updatedItem]);
await persistDayDoc(supabase, date, doc, console.log);

console.log(`Done. Patched ${Object.keys(patches).join(", ")} for ${date}.`);
