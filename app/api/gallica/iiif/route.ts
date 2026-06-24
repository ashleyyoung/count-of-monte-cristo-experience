import { NextRequest, NextResponse } from "next/server";
import { fetchIIIFPage } from "@/lib/gallica";

const ARK_RE = /^bpt6k[a-z0-9]+$/i;
const SIZE_RE = /^[\d,]+$/;

export async function GET(req: NextRequest) {
  const ark = req.nextUrl.searchParams.get("ark");
  const pageParam = req.nextUrl.searchParams.get("page") ?? "1";
  const size = req.nextUrl.searchParams.get("size") ?? "500,";

  if (!ark || !ARK_RE.test(ark)) {
    return NextResponse.json({ error: "invalid ark" }, { status: 400 });
  }

  const page = Number.parseInt(pageParam, 10);
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "invalid page" }, { status: 400 });
  }

  if (!SIZE_RE.test(size)) {
    return NextResponse.json({ error: "invalid size" }, { status: 400 });
  }

  try {
    const image = await fetchIIIFPage(ark, page, "full", size);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
