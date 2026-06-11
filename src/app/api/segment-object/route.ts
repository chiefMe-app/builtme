import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { segmentObjectAtPoint } from "@/lib/falStrictEdit";

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SegmentRequest {
  imageUrl: string;
  clickX: number;
  clickY: number;
  imageWidth: number;
  imageHeight: number;
  targetCategory?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SegmentRequest;
    const { imageUrl, clickX, clickY, imageWidth, imageHeight, targetCategory } = body;

    if (!imageUrl || clickX === undefined || clickY === undefined) {
      return NextResponse.json({ error: "imageUrl, clickX and clickY are required" }, { status: 400 });
    }

    // 1. Point-prompted segmentation
    const rawMaskUrl = await segmentObjectAtPoint({ imageUrl, x: clickX, y: clickY });

    // 2. Download mask, normalise to the original image dimensions,
    //    and dilate slightly (blur + low threshold) so the replacement blends naturally
    const maskRes = await fetch(rawMaskUrl);
    if (!maskRes.ok) throw new Error("Failed to download mask");
    const rawMaskBuf = Buffer.from(await maskRes.arrayBuffer());

    const dilatedMaskBuf = await sharp(rawMaskBuf)
      .resize(imageWidth || undefined, imageHeight || undefined, { fit: "fill" })
      .greyscale()
      .blur(4)
      .threshold(10)
      .png()
      .toBuffer();

    // 3. Compute bbox + mask area from the dilated mask pixels
    const { data: pixels, info } = await sharp(dilatedMaskBuf)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = info.width, minY = info.height, maxX = -1, maxY = -1, onCount = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (pixels[y * info.width + x] > 127) {
          onCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || onCount < 50) {
      return NextResponse.json(
        { error: "We couldn't detect the object clearly. Please tap the center of the item again." },
        { status: 422 }
      );
    }

    const bbox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    const maskArea = onCount / (info.width * info.height);

    // 4. Upload the processed mask (white object on black, image-sized — the
    //    format FLUX Fill expects) to Supabase Storage
    const maskFileName = `mask-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("builtme-uploads")
      .upload(maskFileName, dilatedMaskBuf, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(`Mask upload failed: ${uploadError.message}`);
    const { data: urlData } = supabase.storage.from("builtme-uploads").getPublicUrl(maskFileName);

    // 5. Category: SAM2 is class-agnostic, so we rely on the caller's hint.
    // TODO: classify the masked object (e.g. crop bbox and ask Claude vision)
    // so the category is detected automatically instead of "unknown".
    const category = targetCategory || "unknown";

    return NextResponse.json({
      maskUrl: urlData.publicUrl,
      bbox,
      category,
      maskArea,
      // TODO: SAM2 via this endpoint doesn't expose a confidence score; using a
      // fixed placeholder until we switch to a model that returns one.
      confidence: 0.9,
    });
  } catch (err) {
    console.error("Segmentation error:", err);
    return NextResponse.json(
      { error: "We couldn't detect the object clearly. Please tap the center of the item again." },
      { status: 500 }
    );
  }
}
