import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MergeRequest {
  maskUrls: string[];
  imageWidth: number;
  imageHeight: number;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Unions multiple region masks (white = editable) into one mask. Uses a
 * "lighten" composite so any pixel white in any input is white in the output.
 */
export async function POST(req: NextRequest) {
  try {
    const { maskUrls, imageWidth, imageHeight } = (await req.json()) as MergeRequest;
    if (!maskUrls?.length || !imageWidth || !imageHeight) {
      return NextResponse.json({ error: "maskUrls and image dimensions are required" }, { status: 400 });
    }

    if (maskUrls.length === 1) {
      return NextResponse.json({ maskUrl: maskUrls[0] });
    }

    const buffers = await Promise.all(maskUrls.map(fetchBuffer));
    const normalized = await Promise.all(
      buffers.map(b => sharp(b).resize(imageWidth, imageHeight, { fit: "fill" }).greyscale().png().toBuffer())
    );

    const base = sharp({ create: { width: imageWidth, height: imageHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } });
    const mergedBuf = await base
      .composite(normalized.map(input => ({ input, blend: "lighten" as const })))
      .png()
      .toBuffer();

    const fileName = `mask-merged-${Date.now()}-${Math.round(Math.random() * 1e4)}.png`;
    const { error } = await supabase.storage.from("builtme-uploads").upload(fileName, mergedBuf, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Merged mask upload failed: ${error.message}`);
    const maskUrl = supabase.storage.from("builtme-uploads").getPublicUrl(fileName).data.publicUrl;

    return NextResponse.json({ maskUrl });
  } catch (err) {
    console.error("Merge masks error:", err);
    return NextResponse.json({ error: "Could not merge masks" }, { status: 500 });
  }
}
