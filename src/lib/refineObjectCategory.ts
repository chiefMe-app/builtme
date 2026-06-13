import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

/**
 * Refines a detected object category using its position in the image.
 * SAM-style detectors are class-agnostic and the LLM/manual hint often says
 * generic "decor" — but an item mounted on the upper/middle wall that doesn't
 * touch the floor should be treated as wall_decor so it only ever offers
 * wall-mounted replacements (never plants/vases/tabletop decor).
 */
export function refineObjectCategory({
  rawCategory,
  bbox,
  imageWidth,
  imageHeight,
}: {
  rawCategory?: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
}): string {
  const normalized = normalizeFurnitureCategory(rawCategory || "unknown");

  const centerY = bbox.y + bbox.height / 2;
  const bottomY = bbox.y + bbox.height;

  // Generic decor / unknown sitting high on the wall and not touching the floor
  // → wall-mounted decor
  if (normalized === "decor" || normalized === "unknown") {
    if (imageHeight > 0 && centerY < imageHeight * 0.7 && bottomY < imageHeight * 0.85) {
      return "wall_decor";
    }
  }

  return normalized;
}
