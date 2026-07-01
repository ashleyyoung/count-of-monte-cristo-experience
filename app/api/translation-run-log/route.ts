import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { readTranslationRunLog } from "@/lib/translate/translation-run-log";

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 403 },
    );
  }

  const date = req.nextUrl.searchParams.get("date");
  const runId = req.nextUrl.searchParams.get("runId");
  if (!date || !runId) {
    return NextResponse.json(
      { error: "date and runId are required" },
      { status: 400 },
    );
  }

  const db = createAdminClient();
  const { data: run, error } = await db
    .from("translation_runs")
    .select("status")
    .eq("id", runId)
    .eq("installment_date", date)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const content = readTranslationRunLog(date, runId) ?? "";

  return NextResponse.json({
    content,
    status: run.status as string,
    hasLog: content.length > 0,
  });
}
