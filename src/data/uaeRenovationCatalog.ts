/**
 * Curated UAE minor-renovation material catalog (surfaces & finishes), the
 * source of truth for material options in Minor Renovation mode. Like the
 * furniture catalog, productUrl points at the supplier's product search for the
 * exact item (never a homepage); imageUrl is left empty until a verified image
 * is added (UI then shows a labelled reference image).
 * TODO: fill imageUrl/productUrl with verified direct links.
 */

export type RenovationCategory =
  | "countertop_wrap"
  | "countertop_slab"
  | "cabinet_paint"
  | "cabinet_wrap"
  | "backsplash_tile"
  | "backsplash_sticker"
  | "floor_tile"
  | "floor_sticker"
  | "lighting"
  | "hardware_taps";

export type RenovationCatalogItem = {
  id: string;
  category: RenovationCategory;
  name: string;
  supplier: string;
  brand: string;
  price: number | null;
  currency: "AED";
  unit?: "per sqm" | "per roll" | "per piece" | "set" | "estimate";
  tier: "budget" | "mid" | "premium";
  imageUrl?: string;
  productUrl?: string;
  renderDescription: string;
  styleTags: string[];
  colorTags: string[];
};

const amazon = (q: string) => `https://www.amazon.ae/s?k=${encodeURIComponent(q)}`;
const noon = (q: string) => `https://www.noon.com/uae-en/search/?q=${encodeURIComponent(q)}`;
const ace = (q: string) => `https://www.aceuae.com/catalogsearch/result/?q=${encodeURIComponent(q)}`;
const danube = (q: string) => `https://www.danubehome.com/ae/en/catalogsearch/result/?q=${encodeURIComponent(q)}`;

export const UAE_RENOVATION_CATALOG: RenovationCatalogItem[] = [
  // ---------------- COUNTERTOP WRAP ----------------
  { id: "cw-marble-film", category: "countertop_wrap", name: "Marble-look self-adhesive countertop film", brand: "Amazon AE", supplier: "Amazon.ae", price: 79, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("marble countertop vinyl wrap"), renderDescription: "glossy white marble-look countertop vinyl wrap with grey veining", styleTags: ["modern", "glam"], colorTags: ["white", "marble", "grey"] },
  { id: "cw-stone-wrap", category: "countertop_wrap", name: "Stone-look countertop contact paper", brand: "Noon", supplier: "Noon", price: 119, currency: "AED", unit: "per roll", tier: "mid", imageUrl: "", productUrl: noon("stone countertop wrap"), renderDescription: "matte sand-stone look countertop wrap", styleTags: ["warm minimal", "organic"], colorTags: ["sand", "beige", "stone"] },
  { id: "cw-microcement", category: "countertop_wrap", name: "Microcement countertop finish kit", brand: "ACE UAE", supplier: "ACE UAE", price: 349, currency: "AED", unit: "estimate", tier: "premium", imageUrl: "", productUrl: ace("microcement"), renderDescription: "smooth grey microcement countertop finish", styleTags: ["industrial", "minimal"], colorTags: ["grey", "concrete"] },

  // ---------------- COUNTERTOP SLAB ----------------
  { id: "cs-quartz", category: "countertop_slab", name: "Engineered quartz countertop slab", brand: "ACE UAE", supplier: "ACE UAE", price: 450, currency: "AED", unit: "per sqm", tier: "mid", imageUrl: "", productUrl: ace("quartz countertop"), renderDescription: "white engineered quartz countertop with subtle grey veining", styleTags: ["modern", "minimal", "luxury"], colorTags: ["white", "grey"] },
  { id: "cs-marble", category: "countertop_slab", name: "Natural marble countertop slab", brand: "ACE UAE", supplier: "ACE UAE", price: 700, currency: "AED", unit: "per sqm", tier: "premium", imageUrl: "", productUrl: ace("marble countertop slab"), renderDescription: "polished Calacatta marble countertop with bold veining", styleTags: ["luxury", "glam"], colorTags: ["white", "marble"] },
  { id: "cs-porcelain", category: "countertop_slab", name: "Porcelain slab countertop", brand: "Danube Home UAE", supplier: "Danube Home", price: 380, currency: "AED", unit: "per sqm", tier: "budget", imageUrl: "", productUrl: danube("porcelain slab countertop"), renderDescription: "matte stone-look porcelain slab countertop", styleTags: ["contemporary", "minimal"], colorTags: ["grey", "stone", "neutral"] },

  // ---------------- CABINET PAINT ----------------
  { id: "cp-sage", category: "cabinet_paint", name: "Sage green cabinet & wood paint", brand: "ACE UAE", supplier: "ACE UAE", price: 95, currency: "AED", unit: "per piece", tier: "budget", imageUrl: "", productUrl: ace("cabinet paint sage green"), renderDescription: "matte sage green painted cabinet doors, same structure", styleTags: ["warm minimal", "coastal"], colorTags: ["sage", "green"] },
  { id: "cp-offwhite", category: "cabinet_paint", name: "Off-white satin cabinet paint", brand: "Amazon AE", supplier: "Amazon.ae", price: 110, currency: "AED", unit: "per piece", tier: "mid", imageUrl: "", productUrl: amazon("cabinet paint off white satin"), renderDescription: "soft off-white satin painted cabinet doors", styleTags: ["minimal", "scandinavian"], colorTags: ["off-white", "cream"] },
  { id: "cp-beige", category: "cabinet_paint", name: "Matte beige cabinet paint", brand: "Noon", supplier: "Noon", price: 99, currency: "AED", unit: "per piece", tier: "budget", imageUrl: "", productUrl: noon("beige cabinet paint"), renderDescription: "matte warm beige painted cabinet doors", styleTags: ["warm minimal", "japandi"], colorTags: ["beige", "warm"] },

  // ---------------- CABINET WRAP ----------------
  { id: "cwd-wood", category: "cabinet_wrap", name: "Wood-look cabinet vinyl wrap", brand: "Amazon AE", supplier: "Amazon.ae", price: 69, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("wood look cabinet vinyl wrap"), renderDescription: "warm oak wood-look cabinet door vinyl wrap", styleTags: ["warm minimal", "scandinavian"], colorTags: ["oak", "wood", "natural"] },
  { id: "cwd-matte", category: "cabinet_wrap", name: "Matte cabinet door film", brand: "Noon", supplier: "Noon", price: 89, currency: "AED", unit: "per roll", tier: "mid", imageUrl: "", productUrl: noon("matte cabinet door film"), renderDescription: "matte greige cabinet door film, smooth finish", styleTags: ["minimal", "modern"], colorTags: ["greige", "grey", "neutral"] },
  { id: "cwd-fluted", category: "cabinet_wrap", name: "Fluted cabinet film", brand: "Amazon AE", supplier: "Amazon.ae", price: 129, currency: "AED", unit: "per roll", tier: "premium", imageUrl: "", productUrl: amazon("fluted reeded cabinet film"), renderDescription: "fluted reeded cabinet door film in warm wood tone", styleTags: ["japandi", "contemporary"], colorTags: ["wood", "natural"] },

  // ---------------- BACKSPLASH TILE ----------------
  { id: "bt-ceramic", category: "backsplash_tile", name: "Ceramic backsplash tile", brand: "ACE UAE", supplier: "ACE UAE", price: 45, currency: "AED", unit: "per sqm", tier: "budget", imageUrl: "", productUrl: ace("ceramic backsplash tile"), renderDescription: "glossy white ceramic subway backsplash tile", styleTags: ["classic", "minimal"], colorTags: ["white"] },
  { id: "bt-zellige", category: "backsplash_tile", name: "Zellige-style backsplash tile", brand: "Danube Home UAE", supplier: "Danube Home", price: 120, currency: "AED", unit: "per sqm", tier: "premium", imageUrl: "", productUrl: danube("zellige tile"), renderDescription: "handmade-look glossy zellige backsplash tile in sage", styleTags: ["boho", "mediterranean"], colorTags: ["sage", "green", "glossy"] },
  { id: "bt-porcelain", category: "backsplash_tile", name: "Porcelain backsplash tile", brand: "ACE UAE", supplier: "ACE UAE", price: 65, currency: "AED", unit: "per sqm", tier: "mid", imageUrl: "", productUrl: ace("porcelain backsplash tile"), renderDescription: "matte stone-look porcelain backsplash tile", styleTags: ["modern", "minimal"], colorTags: ["grey", "stone"] },

  // ---------------- BACKSPLASH STICKER ----------------
  { id: "bs-marble", category: "backsplash_sticker", name: "Marble-look peel-and-stick backsplash", brand: "Amazon AE", supplier: "Amazon.ae", price: 49, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("marble peel stick backsplash"), renderDescription: "marble-look peel-and-stick backsplash panel", styleTags: ["modern", "glam"], colorTags: ["white", "marble"] },
  { id: "bs-zellige", category: "backsplash_sticker", name: "Zellige-look tile sticker", brand: "Noon", supplier: "Noon", price: 59, currency: "AED", unit: "per roll", tier: "mid", imageUrl: "", productUrl: noon("zellige tile sticker"), renderDescription: "glossy zellige-look peel-and-stick backsplash tiles in terracotta", styleTags: ["boho", "mediterranean"], colorTags: ["terracotta", "warm"] },
  { id: "bs-subway", category: "backsplash_sticker", name: "Subway tile sticker sheet", brand: "Amazon AE", supplier: "Amazon.ae", price: 39, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("subway tile sticker"), renderDescription: "white subway-tile peel-and-stick backsplash sheet", styleTags: ["classic", "minimal"], colorTags: ["white"] },

  // ---------------- FLOOR TILE ----------------
  { id: "ft-porcelain", category: "floor_tile", name: "Porcelain floor tile", brand: "ACE UAE", supplier: "ACE UAE", price: 55, currency: "AED", unit: "per sqm", tier: "mid", imageUrl: "", productUrl: ace("porcelain floor tile"), renderDescription: "large-format matte porcelain floor tile in warm grey", styleTags: ["modern", "minimal"], colorTags: ["grey", "warm"] },
  { id: "ft-stone", category: "floor_tile", name: "Stone-look floor tile", brand: "Danube Home UAE", supplier: "Danube Home", price: 75, currency: "AED", unit: "per sqm", tier: "premium", imageUrl: "", productUrl: danube("stone look floor tile"), renderDescription: "natural stone-look porcelain floor tile in sand tone", styleTags: ["organic", "warm minimal"], colorTags: ["sand", "stone", "beige"] },
  { id: "ft-ceramic", category: "floor_tile", name: "Ceramic floor tile", brand: "ACE UAE", supplier: "ACE UAE", price: 40, currency: "AED", unit: "per sqm", tier: "budget", imageUrl: "", productUrl: ace("ceramic floor tile"), renderDescription: "neutral matte ceramic floor tile", styleTags: ["minimal"], colorTags: ["neutral", "grey"] },

  // ---------------- FLOOR STICKER ----------------
  { id: "fs-vinyl", category: "floor_sticker", name: "Peel-and-stick vinyl floor tile", brand: "Amazon AE", supplier: "Amazon.ae", price: 89, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("peel stick vinyl floor tile"), renderDescription: "wood-look peel-and-stick vinyl floor planks", styleTags: ["warm minimal", "scandinavian"], colorTags: ["wood", "oak", "natural"] },
  { id: "fs-encaustic", category: "floor_sticker", name: "Encaustic-look floor tile sticker", brand: "Noon", supplier: "Noon", price: 99, currency: "AED", unit: "per roll", tier: "mid", imageUrl: "", productUrl: noon("encaustic floor tile sticker"), renderDescription: "patterned encaustic-look peel-and-stick floor tiles", styleTags: ["boho", "mediterranean"], colorTags: ["blue", "white", "patterned"] },
  { id: "fs-stone", category: "floor_sticker", name: "Stone-look floor sticker", brand: "Amazon AE", supplier: "Amazon.ae", price: 79, currency: "AED", unit: "per roll", tier: "budget", imageUrl: "", productUrl: amazon("stone look floor sticker"), renderDescription: "grey stone-look peel-and-stick floor tiles", styleTags: ["modern", "minimal"], colorTags: ["grey", "stone"] },

  // ---------------- LIGHTING ----------------
  { id: "lt-led-strip", category: "lighting", name: "Under-cabinet LED strip kit", brand: "Amazon AE", supplier: "Amazon.ae", price: 89, currency: "AED", unit: "set", tier: "budget", imageUrl: "", productUrl: amazon("under cabinet led strip"), renderDescription: "warm-white under-cabinet LED strip lighting", styleTags: ["modern", "minimal"], colorTags: ["warm white"] },
  { id: "lt-pendant", category: "lighting", name: "Kitchen pendant light", brand: "Noon", supplier: "Noon", price: 199, currency: "AED", unit: "per piece", tier: "mid", imageUrl: "", productUrl: noon("kitchen pendant light"), renderDescription: "matte black dome pendant light over counter", styleTags: ["modern", "industrial"], colorTags: ["black"] },
  { id: "lt-ceiling", category: "lighting", name: "LED ceiling light panel", brand: "ACE UAE", supplier: "ACE UAE", price: 149, currency: "AED", unit: "per piece", tier: "budget", imageUrl: "", productUrl: ace("led ceiling light panel"), renderDescription: "slim flush LED ceiling light panel", styleTags: ["minimal", "modern"], colorTags: ["white"] },

  // ---------------- HARDWARE & TAPS ----------------
  { id: "hw-black-handles", category: "hardware_taps", name: "Matte black cabinet handles set", brand: "Amazon AE", supplier: "Amazon.ae", price: 65, currency: "AED", unit: "set", tier: "budget", imageUrl: "", productUrl: amazon("matte black cabinet handles"), renderDescription: "matte black bar cabinet handles, same drill positions", styleTags: ["modern", "industrial"], colorTags: ["black"] },
  { id: "hw-brass-pulls", category: "hardware_taps", name: "Brass drawer pulls set", brand: "Noon", supplier: "Noon", price: 129, currency: "AED", unit: "set", tier: "mid", imageUrl: "", productUrl: noon("brass drawer pulls"), renderDescription: "brushed brass drawer pulls, same positions", styleTags: ["glam", "warm minimal"], colorTags: ["brass", "gold"] },
  { id: "hw-tap", category: "hardware_taps", name: "Matte black kitchen mixer tap", brand: "ACE UAE", supplier: "ACE UAE", price: 320, currency: "AED", unit: "per piece", tier: "premium", imageUrl: "", productUrl: ace("matte black kitchen mixer tap"), renderDescription: "matte black gooseneck kitchen mixer tap in same position", styleTags: ["modern", "industrial"], colorTags: ["black"] },
];
