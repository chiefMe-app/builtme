import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { segmentObjectAtPoint } from "@/lib/falStrictEdit";
import { getSurfaceLabel, type RenovationSurfaceCategory } from "@/lib/renovationSurfaceCategories";

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RegionRequest {
  imageUrl: string;
  clickX: number;
  clickY: number;
  imageWidth: number;
  imageHeight: number;
  category: RenovationSurfaceCategory;
}

/**
 * Segments the surface region at a click point (SAM2) and returns a single
 * region mask. Multiple regions of the same category are unioned client-side
 * before rendering. Best-effort: SAM2 grabs the connected region at the click.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegionRequest;
    const { imageUrl, clickX, clickY, imageWidth, imageHeight, category } = body;
    if (!imageUrl || clickX === undefined || clickY === undefined) {
      return NextResponse.json({ error: "imageUrl, clickX and clickY are required" }, { status: 400 });
    }

    const rawMaskUrl = await segmentObjectAtPoint({ imageUrl, x: clickX, y: clickY });

    const maskRes = await fetch(rawMaskUrl);
    if (!maskRes.ok) throw new Error("Failed to download mask");
    const rawMaskBuf = Buffer.from(await maskRes.arrayBuffer());

    // Normalise to image dims, light dilation so edits blend
    const maskBuf = await sharp(rawMaskBuf)
      .resize(imageWidth || undefined, imageHeight || undefined, { fit: "fill" })
      .greyscale()
      .blur(3)
      .threshold(12)
      .png()
      .toBuffer();

    // bbox + area from mask pixels
    const { data: pixels, info } = await sharp(maskBuf).greyscale().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1, onCount = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (pixels[y * info.width + x] > 127) {
          onCount++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || onCount < 50) {
      return NextResponse.json({ error: "We couldn't detect that area clearly. Please tap the centre of the surface again." }, { status: 422 });
    }

    const bbox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    const fileName = `region-${category}-${Date.now()}-${Math.round(Math.random() * 1e4)}.png`;
    const { error } = await supabase.storage.from("builtme-uploads").upload(fileName, maskBuf, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Region mask upload failed: ${error.message}`);
    const maskUrl = supabase.storage.from("builtme-uploads").getPublicUrl(fileName).data.publicUrl;

    console.log("[renovation-region]", { category, bbox, areaRatio: (onCount / (info.width * info.height)).toFixed(4) });

    return NextResponse.json({
      id: `region_${Date.now()}_${Math.round(Math.random() * 1e4)}`,
      category,
      label: getSurfaceLabel(category),
      maskUrl,
      bbox,
      imageWidth,
      imageHeight,
    });
  } catch (err) {
    console.error("Region segmentation error:", err);
    return NextResponse.json({ error: "We couldn't detect that area clearly. Please tap the centre of the surface again." }, { status: 500 });
  }
}
