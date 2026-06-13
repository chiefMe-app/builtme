import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

/**
 * Whether a product category may replace a selected object category.
 * Used both to filter shown options and to validate the render payload, so a
 * wall-mounted object can never be assigned a plant/vase/tabletop replacement
 * (and a dining table can never become a sofa).
 */
export function isCompatibleReplacement(objectCategory: string, productCategory: string): boolean {
  const o = normalizeFurnitureCategory(objectCategory);
  const p = normalizeFurnitureCategory(productCategory);

  if (o === p) return true;

  // Mutually-interchangeable groups
  const chairLike = new Set(["chair", "dining_chair", "armchair"]);
  if (chairLike.has(o) && chairLike.has(p)) return true;

  // Wall-mounted decor: art / decor / panel / sculpture are interchangeable.
  // Mirror is only interchangeable when the object is generic wall_decor.
  const wallMounted = new Set(["wall_decor", "wall_art", "wall_panel", "wall_sculpture"]);
  if (wallMounted.has(o) && wallMounted.has(p)) return true;
  if (o === "wall_decor" && p === "mirror") return true;

  // Surface / soft decor — only swap within their own kind
  const surfaceDecor = new Set(["vase", "tabletop_decor"]);
  if (surfaceDecor.has(o) && surfaceDecor.has(p)) return true;

  // mirror, plant, cushion, throw, curtains, decor only replace like-for-like
  // (covered by the o === p check above)
  return false;
}
