import { NextRequest, NextResponse } from "next/server";
import { updateBookProgress } from "@/lib/book-progress";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: Parameters<typeof updateBookProgress>[0] = {};

    if (typeof body.readChapter === "string") {
      input.readChapter = body.readChapter;
    }
    if (typeof body.listenChapter === "string") {
      input.listenChapter = body.listenChapter;
    }
    if (typeof body.listenPosition === "number") {
      input.listenPosition = body.listenPosition;
    }
    if (body.listenLang === "en" || body.listenLang === "fr") {
      input.listenLang = body.listenLang;
    }

    await updateBookProgress(input);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
