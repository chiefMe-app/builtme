import { UAE_FURNITURE_CATALOG, CatalogProduct } from "@/data/uaeFurnitureCatalog";
import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";
import { searchProductsOnline, isOnlineSearchConfigured } from "@/lib/productSearchProvider";

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
 * Matches LLM-identified category needs against the curated catalog, then
 * enriches with live online product search (SerpApi Google Shopping) when the
 * catalog has fewer than 3 options for a category. Online results carry real
 * product images and links — no generic fallback images are ever injected here.
 * Falls back to catalog-only when online search is not configured.
 */
export async function matchCatalogProducts({
  neededCategories,
  budget,
}: {
  neededCategories: NeededCategory[];
  budget: number;
}): Promise<MatchedProduct[]> {
  const products: MatchedProduct[] = [];
  const onlineEnabled = isOnlineSearchConfigured();

  for (const need of neededCategories.slice(0, 5)) {
    const normalizedCategory = normalizeFurnitureCategory(need.category);
    // "chair" needs map onto dining_chair/armchair pools
    const pool = UAE_FURNITURE_CATALOG.filter(p =>
      p.category === normalizedCategory ||
      (normalizedCategory === "chair" && (p.category === "dining_chair" || p.category === "armchair"))
    );
    // No catalog products for this category — try online search before giving
    // up, but never substitute another category (guardrail against e.g.
    // dining_table silently becoming coffee_table).
    if (pool.length === 0) {
      const onlineOptions: MatchedOption[] = [];
      if (onlineEnabled) {
        try {
          const online = await searchProductsOnline({
            category: normalizedCategory,
            styleTags: need.styleTags,
            colorTags: need.colorTags,
            budget,
            suppliers: ["IKEA", "West Elm", "Pottery Barn", "Home Centre"],
          });
          for (const o of online.slice(0, 5)) {
            onlineOptions.push({
              id: o.id, name: o.name, brand: o.brand,
              price: o.price !== null ? String(o.price) : "Price unavailable",
              tier: o.tier, imageUrl: o.imageUrl, productUrl: o.productUrl, renderDescription: o.renderDescription,
            });
          }
        } catch (err) {
          console.error("Online search failed (non-fatal):", err);
        }
      }
      products.push({
        category: normalizedCategory,
        itemName: need.itemName,
        renderDescription: need.renderDescription,
        options: onlineOptions,
      });
      continue;
    }

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

    // Enrich with online search when the catalog is thin (<3 options)
    if (onlineEnabled && options.length < 3) {
      try {
        const online = await searchProductsOnline({
          category: normalizedCategory,
          styleTags: need.styleTags,
          colorTags: need.colorTags,
          budget,
          suppliers: ["IKEA", "West Elm", "Pottery Barn", "Home Centre"],
        });
        for (const o of online) {
          if (options.length >= 5) break;
          if (options.some(existing => existing.name === o.name)) continue;
          options.push({
            id: o.id,
            name: o.name,
            brand: o.brand,
            price: o.price !== null ? String(o.price) : "Price unavailable",
            tier: o.tier,
            imageUrl: o.imageUrl,
            productUrl: o.productUrl,
            renderDescription: o.renderDescription,
          });
        }
      } catch (err) {
        console.error("Online enrichment failed (non-fatal):", err);
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
