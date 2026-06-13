import { validateShoppingProduct } from "@/lib/validateShoppingProduct";
import { makeCacheKey, getCachedSearch, setCachedSearch } from "@/lib/productSearchCache";

export type ProductSearchResult = {
  id: string;
  category: string;
  name: string;
  supplier: string;
  brand: string;
  price: number | null;
  currency: "AED";
  imageUrl: string;
  productUrl: string;
  sourceUrl?: string;
  tier: "budget" | "mid" | "premium";
  renderDescription: string;
};

export function isOnlineSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

const CATEGORY_TERMS: Record<string, string> = {
  dining_table: "dining table",
  dining_chair: "dining chair",
  coffee_table: "coffee table",
  chair: "accent chair",
  armchair: "armchair",
  sofa: "3 seat sofa",
  rug: "rug",
  lighting: "pendant light",
  wall_art: "wall art framed print",
  wall_decor: "wall decor",
  wall_panel: "3d wall panel",
  mirror: "wall mirror",
  vase: "decorative vase",
  tabletop_decor: "decorative bowl object",
  plant: "artificial plant",
};

function buildShoppingQuery({
  category,
  styleTags,
  colorTags,
  supplier,
}: {
  category: string;
  styleTags?: string[];
  colorTags?: string[];
  supplier?: string;
}): string {
  const term = CATEGORY_TERMS[category] || category.replace(/_/g, " ");
  const colour = (colorTags || [])[0] || "";
  const style = (styleTags || [])[0] || "";
  const supplierPart = supplier ? `${supplier} UAE` : "UAE";
  return [supplierPart, term, colour, style].filter(Boolean).join(" ").trim();
}

interface SerpShoppingResult {
  title?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  thumbnails?: string[];
  product_id?: string;
}

function assignTiers(results: ProductSearchResult[]): ProductSearchResult[] {
  const priced = results.filter(r => r.price !== null).sort((a, b) => (a.price! - b.price!));
  priced.forEach((r, i) => {
    const frac = priced.length <= 1 ? 0.5 : i / (priced.length - 1);
    r.tier = frac < 0.34 ? "budget" : frac < 0.67 ? "mid" : "premium";
  });
  // Unpriced default to mid
  results.filter(r => r.price === null).forEach(r => { r.tier = "mid"; });
  return results;
}

async function serpApiShopping(query: string): Promise<SerpShoppingResult[]> {
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&gl=ae&hl=en&api_key=${process.env.SERPAPI_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi returned ${res.status}`);
  const data = await res.json();
  return (data.shopping_results || []) as SerpShoppingResult[];
}

export async function searchProductsOnline({
  category,
  styleTags,
  colorTags,
  budget,
  suppliers,
}: {
  category: string;
  styleTags?: string[];
  colorTags?: string[];
  budget?: number;
  suppliers?: string[];
}): Promise<ProductSearchResult[]> {
  if (!isOnlineSearchConfigured()) return [];

  const cacheKey = makeCacheKey({ category, styleTags, colorTags, budget, supplier: (suppliers || []).join(",") });
  const cached = getCachedSearch<ProductSearchResult[]>(cacheKey);
  if (cached) return cached;

  const supplierList = suppliers && suppliers.length ? suppliers : [undefined];
  const collected: ProductSearchResult[] = [];
  let totalRaw = 0;

  for (const supplier of supplierList) {
    const query = buildShoppingQuery({ category, styleTags, colorTags, supplier });
    let raw: SerpShoppingResult[] = [];
    try {
      raw = await serpApiShopping(query);
    } catch (err) {
      console.error("[product-search] SerpApi error:", err);
      continue;
    }
    totalRaw += raw.length;

    for (const r of raw) {
      const imageUrl = r.thumbnail || (r.thumbnails && r.thumbnails[0]) || "";
      const productUrl = r.product_link || r.link || "";
      const source = r.source || supplier || "";
      if (!validateShoppingProduct({ title: r.title, imageUrl, productUrl, source, expectedCategory: category })) continue;

      collected.push({
        id: r.product_id || `${source}-${(r.title || "").slice(0, 24)}-${collected.length}`,
        category,
        name: r.title!,
        supplier: source,
        brand: source,
        price: typeof r.extracted_price === "number" ? r.extracted_price : null,
        currency: "AED",
        imageUrl,
        productUrl,
        sourceUrl: r.link,
        tier: "mid",
        renderDescription: r.title!,
      });
    }
  }

  const result = assignTiers(collected);
  console.log("[product-search]", { category, suppliers: supplierList, rawCount: totalRaw, validResultsCount: result.length });
  setCachedSearch(cacheKey, result);
  return result;
}
