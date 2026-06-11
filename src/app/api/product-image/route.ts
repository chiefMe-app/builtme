import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Simple in-memory cache so repeated option queries don't re-hit the search
const cache = new Map<string, string[]>();

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q) return NextResponse.json({ error: "No query" }, { status: 400 });

  const cached = cache.get(q);
  if (cached) return NextResponse.json({ images: cached });

  try {
    const res = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );
    const html = await res.text();
    const matches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)].map(
      (m) => m[1]
    );
    const images = matches.slice(0, 3);
    if (images.length > 0) cache.set(q, images);
    return NextResponse.json({ images });
  } catch (err) {
    console.error("Product image search failed:", err);
    return NextResponse.json({ images: [] });
  }
}
