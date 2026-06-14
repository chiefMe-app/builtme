import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Creates a polygon inpainting mask: a white filled polygon (editable) on a
 * black background (preserved), sized to the original image. Rendered from an
 * SVG polygon via sharp, uploaded to Supabase Storage. Same mask format the
 * surface render pipeline already consumes — white = edit, black = keep.
 */
export async function createPolygonMask({
  polygon,
  imageWidth,
  imageHeight,
}: {
  polygon: Array<{ x: number; y: number }>;
  imageWidth: number;
  imageHeight: number;
}): Promise<string> {
  if (!polygon || polygon.length < 3) throw new Error("Polygon needs at least 3 points");

  const points = polygon
    .map(p => `${Math.max(0, Math.min(imageWidth, Math.round(p.x)))},${Math.max(0, Math.min(imageHeight, Math.round(p.y)))}`)
    .join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}">
    <rect width="100%" height="100%" fill="black"/>
    <polygon points="${points}" fill="white"/>
  </svg>`;

  const maskBuf = await sharp(Buffer.from(svg)).png().toBuffer();

  const fileName = `mask-polygon-${Date.now()}-${Math.round(Math.random() * 1e4)}.png`;
  const { error } = await supabase.storage
    .from("builtme-uploads")
    .upload(fileName, maskBuf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Polygon mask upload failed: ${error.message}`);

  return supabase.storage.from("builtme-uploads").getPublicUrl(fileName).data.publicUrl;
}

/** Axis-aligned bounding box of a polygon (for overlay/debug). */
export function bboxFromPolygon(polygon: Array<{ x: number; y: number }>) {
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(...xs) - x), height: Math.round(Math.max(...ys) - y) };
}
