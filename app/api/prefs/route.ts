import { NextRequest, NextResponse } from "next/server";
import { updatePrefs } from "@/lib/progress";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prefs: Parameters<typeof updatePrefs>[0] = {};
    if (typeof body.lastLocation === "string") {
      prefs.lastLocation = body.lastLocation;
    }
    if (body.viewPref === "horizontal" || body.viewPref === "vertical") {
      prefs.viewPref = body.viewPref;
    }
    await updatePrefs(prefs);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
