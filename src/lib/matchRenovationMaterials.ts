import { UAE_RENOVATION_CATALOG, RenovationCatalogItem } from "@/data/uaeRenovationCatalog";
import { normalizeRenovationCategory } from "@/lib/normalizeRenovationCategory";

export interface RenovationAction {
  id?: string;
  label: string;
  category?: string;
  normalizedCategory?: string;
}

interface MaterialOption {
  id: string;
  name: string;
  brand: string;
  supplier: string;
  price: string;
  unit?: string;
  tier: string;
  imageUrl: string;
  productUrl: string;
  renderDescription: string;
}

interface MaterialProduct {
  category: string;
  itemName: string;
  renderDescription: string;
  options: MaterialOption[];
}

const TIERS = ["budget", "mid", "premium"] as const;

function tagScore(item: RenovationCatalogItem, styleTags: string[], colorTags: string[]): number {
  let score = 0;
  for (const tag of styleTags) if (item.styleTags.some(t => t.includes(tag) || tag.includes(t))) score += 2;
  for (const tag of colorTags) if (item.colorTags.some(t => t.includes(tag) || tag.includes(t))) score += 1;
  return score;
}

/**
 * Matches selected renovation actions to curated material options. Each action
 * yields one budget / mid / premium option from its category. Never substitutes
 * a different category (an action with no materials returns empty options).
 */
export function matchRenovationMaterials({
  selectedRenovationActions,
  styleTags = [],
  colorTags = [],
}: {
  selectedRenovationActions: RenovationAction[];
  budget?: number;
  styleTags?: string[];
  colorTags?: string[];
}): MaterialProduct[] {
  const products: MaterialProduct[] = [];
  const seen = new Set<string>();
  const st = styleTags.map(t => t.toLowerCase());
  const ct = colorTags.map(t => t.toLowerCase());

  for (const action of selectedRenovationActions) {
    const category = normalizeRenovationCategory(action.normalizedCategory || action.category || action.label);
    if (seen.has(category)) continue;
    seen.add(category);

    const pool = UAE_RENOVATION_CATALOG.filter(m => m.category === category);
    const options: MaterialOption[] = [];

    for (const tier of TIERS) {
      const tierPool = pool.filter(m => m.tier === tier);
      const candidates = tierPool.length > 0 ? tierPool : pool;
      const best = [...candidates].sort((a, b) => tagScore(b, st, ct) - tagScore(a, st, ct))[0];
      if (best && !options.some(o => o.id === best.id)) {
        options.push({
          id: best.id,
          name: best.name,
          brand: best.brand,
          supplier: best.supplier,
          price: best.price !== null ? String(best.price) : "Price unavailable",
          unit: best.unit,
          tier: best.tier,
          imageUrl: best.imageUrl || "",
          productUrl: best.productUrl || "",
          renderDescription: best.renderDescription,
        });
      }
    }

    products.push({
      category,
      itemName: action.label,
      renderDescription: pool[0]?.renderDescription || action.label,
      options,
    });
  }

  return products;
}
