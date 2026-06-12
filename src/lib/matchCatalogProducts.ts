import { UAE_FURNITURE_CATALOG, CatalogProduct } from "@/data/uaeFurnitureCatalog";
import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

export interface NeededCategory {
  category: string;
  itemName: string;
  renderDescription: string;
  styleTags?: string[];
  colorTags?: string[];
}

export interface MatchedOption {
  id: string;
  name: string;
  brand: string;
  price: string;
  tier: string;
  imageUrl: string;
  productUrl: string;
  renderDescription: string;
}

export interface MatchedProduct {
  category: string;
  itemName: string;
  renderDescription: string;
  options: MatchedOption[];
}

const TIERS = ["budget", "mid", "premium"] as const;

function tagScore(product: CatalogProduct, styleTags: string[], colorTags: string[]): number {
  let score = 0;
  for (const tag of styleTags) {
    if (product.styleTags.some(t => t.includes(tag) || tag.includes(t))) score += 2;
  }
  for (const tag of colorTags) {
    if (product.colorTags.some(t => t.includes(tag) || tag.includes(t))) score += 1;
  }
  return score;
}

/**
 * Matches LLM-identified category needs against the curated catalog.
 * Returns exactly one budget / one mid / one premium option per category,
 * preferring products whose style/colour tags match the requested direction.
 */
export function matchCatalogProducts({
  neededCategories,
  budget,
}: {
  neededCategories: NeededCategory[];
  budget: number;
}): MatchedProduct[] {
  const products: MatchedProduct[] = [];

  for (const need of neededCategories.slice(0, 5)) {
    const normalizedCategory = normalizeFurnitureCategory(need.category);
    // "chair" needs map onto dining_chair/armchair pools
    const pool = UAE_FURNITURE_CATALOG.filter(p =>
      p.category === normalizedCategory ||
      (normalizedCategory === "chair" && (p.category === "dining_chair" || p.category === "armchair"))
    );
    if (pool.length === 0) continue;

    const styleTags = (need.styleTags || []).map(t => t.toLowerCase());
    const colorTags = (need.colorTags || []).map(t => t.toLowerCase());

    const options: MatchedOption[] = [];
    for (const tier of TIERS) {
      const tierPool = pool.filter(p => p.tier === tier);
      const candidates = tierPool.length > 0 ? tierPool : pool;
      // Best tag match within the tier; cheap wins ties on small budgets
      const best = [...candidates].sort((a, b) => {
        const diff = tagScore(b, styleTags, colorTags) - tagScore(a, styleTags, colorTags);
        if (diff !== 0) return diff;
        return budget > 0 && budget < 10000 ? a.price - b.price : b.price - a.price;
      })[0];
      if (best && !options.some(o => o.id === best.id)) {
        options.push({
          id: best.id,
          name: best.name,
          brand: best.brand,
          price: String(best.price),
          tier: best.tier,
          imageUrl: best.imageUrl,
          productUrl: best.productUrl,
          renderDescription: best.renderDescription,
        });
      }
    }

    products.push({
      category: normalizedCategory,
      itemName: need.itemName,
      renderDescription: need.renderDescription,
      options,
    });
  }

  return products;
}
