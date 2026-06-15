import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { inferMaterialFinish, type MaterialPattern } from "@/lib/inferMaterialFinish";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Opacity of the deterministic material layer (keeps some original shading)
function opacityFor(pattern: MaterialPattern): number {
  if (pattern === "brass" || pattern === "matte_black" || pattern === "chrome") return 0.8;
  if (pattern === "marble" || pattern === "stone" || pattern === "microcement" || pattern === "concrete") return 0.72;
  return 0.72;
}

// Build an SVG material layer sized to the image, rasterised by sharp.
function materialSvg(pattern: MaterialPattern, color: string, w: number, h: number): string {
  const rect = `<rect width="100%" height="100%" fill="${color}"/>`;
  switch (pattern) {
    case "wood":
    case "fluted_wood":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}
        <rect width="100%" height="100%" fill="url(#g)"/>
        <defs><pattern id="g" width="24" height="10" patternUnits="userSpaceOnUse">
        <rect width="24" height="10" fill="${color}"/>
        <rect width="24" height="3" y="0" fill="rgba(0,0,0,0.10)"/>
        <rect width="24" height="2" y="6" fill="rgba(255,255,255,0.08)"/>
        </pattern></defs></svg>`;
    case "marble":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}
        <path d="M0 ${h * 0.3} Q ${w * 0.3} ${h * 0.25} ${w * 0.6} ${h * 0.4} T ${w} ${h * 0.35}" stroke="rgba(150,150,150,0.4)" stroke-width="2" fill="none"/>
        <path d="M0 ${h * 0.65} Q ${w * 0.4} ${h * 0.6} ${w * 0.7} ${h * 0.72} T ${w} ${h * 0.68}" stroke="rgba(180,160,120,0.35)" stroke-width="2" fill="none"/></svg>`;
    case "stone":
    case "concrete":
    case "microcement":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}
        <radialGradient id="s" cx="35%" cy="40%" r="60%"><stop offset="0%" stop-color="rgba(0,0,0,0.10)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
        <rect width="100%" height="100%" fill="url(#s)"/></svg>`;
    case "zellige":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}
        <defs><pattern id="z" width="22" height="22" patternUnits="userSpaceOnUse">
        <rect width="22" height="22" fill="${color}"/>
        <rect width="22" height="22" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
        <rect width="11" height="22" fill="rgba(255,255,255,0.05)"/>
        </pattern></defs><rect width="100%" height="100%" fill="url(#z)"/></svg>`;
    case "subway_tile":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}
        <defs><pattern id="t" width="40" height="20" patternUnits="userSpaceOnUse">
        <rect width="40" height="20" fill="${color}"/>
        <rect width="40" height="20" fill="none" stroke="rgba(150,150,150,0.4)" stroke-width="1.5"/>
        </pattern></defs><rect width="100%" height="100%" fill="url(#t)"/></svg>`;
    case "brass":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#C9A23F"/><stop offset="50%" stop-color="#E8CE84"/><stop offset="100%" stop-color="#B8902F"/></linearGradient>
        <rect width="100%" height="100%" fill="url(#b)"/></svg>`;
    case "chrome":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9AA0A6"/><stop offset="50%" stop-color="#E6E9EC"/><stop offset="100%" stop-color="#8A9097"/></linearGradient>
        <rect width="100%" height="100%" fill="url(#c)"/></svg>`;
    case "matte_black":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2A2A2A"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rect}</svg>`;
  }
}

/**
 * Deterministically applies a material finish inside the white mask region,
 * preserving every pixel outside the mask. No AI. Returns an uploaded preview URL.
 */
export async function applyMaterialToMask({
  imageUrl,
  maskUrl,
  material,
}: {
  imageUrl: string;
  maskUrl: string;
  material: { category: string; name: string; renderDescription: string; colorTags?: string[] };
}): Promise<string> {
  const [baseBuf, maskBuf] = await Promise.all([fetchBuffer(imageUrl), fetchBuffer(maskUrl)]);
  const meta = await sharp(baseBuf).metadata();
  const w = meta.width, h = meta.height;
  if (!w || !h) throw new Error("Could not read base image dimensions");

  const finish = inferMaterialFinish(material);
  const opacity = opacityFor(finish.pattern);

  // Rasterise material layer to image size
  const materialRgb = await sharp(Buffer.from(materialSvg(finish.pattern, finish.color, w, h)))
    .resize(w, h, { fit: "fill" })
    .removeAlpha()
    .toBuffer();

  // Alpha = mask (white=1) scaled by opacity → outside mask alpha 0 (preserved)
  const alpha = await sharp(maskBuf)
    .resize(w, h, { fit: "fill" })
    .greyscale()
    .blur(1.5)
    .linear(opacity, 0)
    .toColourspace("b-w")
    .toBuffer();

  const materialWithAlpha = await sharp(materialRgb).joinChannel(alpha).png().toBuffer();

  const outBuf = await sharp(baseBuf)
    .composite([{ input: materialWithAlpha }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const fileName = `safe-preview-${Date.now()}-${Math.round(Math.random() * 1e4)}.jpg`;
  const { error } = await supabase.storage.from("builtme-uploads").upload(fileName, outBuf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Safe preview upload failed: ${error.message}`);
  return supabase.storage.from("builtme-uploads").getPublicUrl(fileName).data.publicUrl;
}
