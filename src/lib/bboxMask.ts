import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { BBox } from "./expandFurnitureBbox";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Creates a rectangular inpainting mask from a bbox: white rectangle (editable)
 * over a black background (preserved), sized to the original image. Uploads it
 * to Supabase Storage and returns the public URL — the same mask format the
 * strict render flow already consumes.
 *
 * TODO: replace this bbox fallback with proper full-object segmentation
 * (e.g. SAM2 multi-point / box prompts) so masks hug the object outline.
 */
export async function createBboxMask({
  bbox,
  imageWidth,
  imageHeight,
}: {
  bbox: BBox;
  imageWidth: number;
  imageHeight: number;
}): Promise<string> {
  const x = Math.max(0, Math.min(Math.round(bbox.x), imageWidth - 1));
  const y = Math.max(0, Math.min(Math.round(bbox.y), imageHeight - 1));
  const width = Math.max(1, Math.min(Math.round(bbox.width), imageWidth - x));
  const height = Math.max(1, Math.min(Math.round(bbox.height), imageHeight - y));

  const whiteRect = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  const maskBuf = await sharp({
    create: { width: imageWidth, height: imageHeight, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: whiteRect, left: x, top: y }])
    .png()
    .toBuffer();

  const fileName = `mask-bbox-${Date.now()}.png`;
  const { error } = await supabase.storage
    .from("builtme-uploads")
    .upload(fileName, maskBuf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Bbox mask upload failed: ${error.message}`);

  const { data } = supabase.storage.from("builtme-uploads").getPublicUrl(fileName);
  return data.publicUrl;
}
