/**
 * Normalizes a minor-renovation action label/id into a material category.
 * Ordering matters: sticker/floor variants are checked before the generic
 * "tile" rule so "Tile sticker" → backsplash_sticker (not backsplash_tile)
 * and "Floor sticker tile" → floor_sticker.
 */
export function normalizeRenovationCategory(input?: string): string {
  const value = (input || "").toLowerCase().trim();
  if (!value) return "unknown";

  // Sticker / peel-and-stick variants first
  if (value.includes("floor") && (value.includes("sticker") || value.includes("peel"))) return "floor_sticker";
  if (value.includes("sticker") || value.includes("peel")) return "backsplash_sticker";

  // Countertop
  if (value.includes("countertop") && value.includes("wrap")) return "countertop_wrap";
  if (value.includes("countertop")) return "countertop_slab";

  // Cabinets
  if (value.includes("cabinet") && value.includes("wrap")) return "cabinet_wrap";
  if (value.includes("cabinet")) return "cabinet_paint";

  // Floor tiles
  if (value.includes("floor")) return "floor_tile";

  // Hardware
  if (value.includes("handle") || value.includes("tap") || value.includes("faucet") || value.includes("hardware") || value.includes("pull")) return "hardware_taps";

  // Lighting
  if (value.includes("light")) return "lighting";

  // Backsplash / wall tiles
  if (value.includes("backsplash") || value.includes("tile")) return "backsplash_tile";

  return value.replace(/\s+/g, "_");
}
