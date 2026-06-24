import { NextRequest, NextResponse } from "next/server";
import { markComplete, markIncomplete } from "@/lib/progress";

export async function POST(req: NextRequest) {
  try {
    const { date, completed } = await req.json();
    if (typeof date !== "string") {
      return NextResponse.json({ error: "date required" }, { status: 400 });
    }
    if (completed) {
      await markComplete(date);
    } else {
      await markIncomplete(date);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
