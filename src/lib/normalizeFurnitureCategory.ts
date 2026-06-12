export function normalizeFurnitureCategory(input?: string): string {
  const value = (input || "").toLowerCase().trim();

  if (!value) return "unknown";

  if (value.includes("sofa") || value.includes("couch")) return "sofa";
  if (value.includes("coffee") && value.includes("table")) return "coffee_table";
  if (value.includes("dining") && value.includes("table")) return "dining_table";
  if (value.includes("dining") && value.includes("chair")) return "dining_chair";
  if (value.includes("armchair") || value.includes("accent chair")) return "armchair";
  if (value === "chair" || value.includes("chair")) return "chair";
  if (value.includes("rug") || value.includes("carpet")) return "rug";
  if (value.includes("light") || value.includes("pendant") || value.includes("lamp")) return "lighting";
  if (value.includes("tv") || value.includes("console") || value.includes("sideboard") || value.includes("media unit")) return "tv_unit";
  if (value.includes("decor") || value.includes("vase") || value.includes("art") || value.includes("pampas")) return "decor";
  if (value.includes("plant")) return "plant";

  return value.replace(/\s+/g, "_");
}

export function getCategoryPlacementRule(category: string): string {
  switch (category) {
    case "sofa":
      return "Apply only to the existing sofa/living seating area. Keep sofa position and scale similar.";
    case "coffee_table":
      return "Apply only to the existing coffee table in the living area. Do not affect dining tables or TV units.";
    case "dining_table":
      return "Apply only to the existing dining table area. It must remain a dining table, not a console or sideboard.";
    case "dining_chair":
    case "chair":
    case "armchair":
      return "Apply only to existing chairs of the matching type. Keep chair positions and scale realistic.";
    case "rug":
      return "Apply only to the existing rug/floor textile area. Do not change furniture type.";
    case "lighting":
      return "Apply only to existing ceiling light/pendant/lamp positions. Do not move the fixture point.";
    case "tv_unit":
      return "Apply only if an existing TV unit/console is visible. Do not invent a new oversized wall unit.";
    case "decor":
      return "Apply subtly to existing decor surfaces or wall decor. Do not create oversized furniture.";
    default:
      return "Apply only if a clearly matching existing object is visible. Otherwise skip this product.";
  }
}
