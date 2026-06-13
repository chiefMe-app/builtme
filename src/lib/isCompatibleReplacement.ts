import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

/**
 * Whether a product category may be used to replace a selected object category.
 * Used both to filter shown options and to validate the render payload, so a
 * dining-table object can never be assigned a sofa replacement.
 */
export function isCompatibleReplacement(objectCategory: string, productCategory: string): boolean {
  const o = normalizeFurnitureCategory(objectCategory);
  const p = normalizeFurnitureCategory(productCategory);

  if (o === p) return true;

  // Chairs are interchangeable across dining_chair / chair / armchair
  const chairLike = new Set(["chair", "dining_chair", "armchair"]);
  if (chairLike.has(o) && chairLike.has(p)) return true;

  return false;
}
