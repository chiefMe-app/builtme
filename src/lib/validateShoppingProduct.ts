import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

// Per-category title keywords: must include at least one `include`, and must
// NOT include any `reject` term. Keeps a dining_table query from returning
// coffee tables, a wall_art query from returning plants/vases, etc.
const CATEGORY_KEYWORDS: Record<string, { include: string[]; reject: string[] }> = {
  dining_table: { include: ["dining table", "extendable table", "dining set"], reject: ["coffee table", "side table", "console", "desk", "bedside"] },
  coffee_table: { include: ["coffee table", "cocktail table"], reject: ["dining table", "console", "desk"] },
  dining_chair: { include: ["dining chair", "chair"], reject: ["office chair", "sofa", "armchair", "stool", "bar"] },
  chair: { include: ["chair", "armchair", "accent chair"], reject: ["sofa", "stool", "bench"] },
  armchair: { include: ["armchair", "accent chair", "lounge chair"], reject: ["sofa", "dining"] },
  sofa: { include: ["sofa", "couch", "3-seat", "3 seat", "2-seat", "sectional", "settee"], reject: ["chair", "armchair", "bed", "cover", "throw"] },
  rug: { include: ["rug", "carpet"], reject: ["runner mat", "bath mat", "door mat"] },
  lighting: { include: ["lamp", "pendant", "light", "chandelier", "lantern"], reject: ["bulb", "switch", "candle"] },
  wall_art: { include: ["wall art", "framed", "print", "canvas", "picture", "poster", "painting", "wall hanging"], reject: ["plant", "vase", "cushion", "throw", "rug", "mirror"] },
  wall_decor: { include: ["wall decor", "wall hanging", "wall panel", "wall medallion", "wall disc", "wall art"], reject: ["plant", "vase", "cushion", "throw", "floor"] },
  wall_panel: { include: ["wall panel", "3d panel", "wall cladding"], reject: ["plant", "vase", "floor"] },
  mirror: { include: ["mirror"], reject: ["mirror sticker", "compact"] },
  vase: { include: ["vase", "pampas", "bottle"], reject: ["wall", "framed"] },
  tabletop_decor: { include: ["bowl", "tray", "sculpture", "object", "tabletop", "ornament"], reject: ["wall", "framed", "plant"] },
  plant: { include: ["plant", "tree", "monstera", "greenery", "palm"], reject: ["pot only", "vase", "wall"] },
};

// Recognised UAE suppliers (matched loosely against the result's source)
const ALLOWED_SUPPLIERS = [
  "ikea", "home centre", "homecentre", "west elm", "westelm", "pottery barn", "potterybarn",
  "lucky furniture", "pan emirates", "panemirates", "danube", "2xl", "the one", "theone",
  "amazon", "noon",
];

export function isRecognisedSupplier(source?: string): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return ALLOWED_SUPPLIERS.some(sup => s.includes(sup));
}

function isHomepageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Homepage = no meaningful path
    return u.pathname.replace(/\/+$/, "") === "" || u.pathname === "/";
  } catch {
    return true;
  }
}

export function validateShoppingProduct({
  title,
  imageUrl,
  productUrl,
  source,
  expectedCategory,
}: {
  title?: string;
  imageUrl?: string;
  productUrl?: string;
  source?: string;
  expectedCategory: string;
}): boolean {
  if (!title || !imageUrl || !productUrl || !source) return false;
  if (!imageUrl.startsWith("http") || !productUrl.startsWith("http")) return false;
  if (isHomepageUrl(productUrl)) return false;

  const cat = normalizeFurnitureCategory(expectedCategory);
  const keywords = CATEGORY_KEYWORDS[cat];
  const t = title.toLowerCase();

  if (keywords) {
    if (keywords.reject.some(r => t.includes(r))) return false;
    const matches = keywords.include.some(inc => t.includes(inc));
    if (!matches) {
      // Allow only if the supplier is strongly recognised AND title isn't rejected
      if (!isRecognisedSupplier(source)) return false;
    }
  }

  return true;
}
