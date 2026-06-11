import { isValidProductImageUrl } from "./validateProductImage";

/**
 * Sanitises product options: any imageUrl that fails validation is blanked so
 * the UI falls back to a safe local category image. Never invents URLs.
 *
 * TODO: plug in a real product search API (e.g. retailer product feeds or a
 * shopping API) here to fill empty imageUrl/productUrl with verified data.
 * Do NOT add broad image search (Google/Bing) — that's how unrelated images
 * ended up on product cards before.
 */

interface EnrichableOption {
  name: string;
  brand: string;
  price: string;
  tier: string;
  productUrl?: string;
  imageUrl?: string;
}

interface EnrichableProduct {
  category: string;
  itemName: string;
  renderDescription?: string;
  options: EnrichableOption[];
}

export async function enrichProductImages<T extends EnrichableProduct>(products: T[]): Promise<T[]> {
  return products.map(product => ({
    ...product,
    options: (product.options || []).map(opt => ({
      ...opt,
      imageUrl: isValidProductImageUrl({
        imageUrl: opt.imageUrl,
        productName: opt.name,
        category: product.category,
        brand: opt.brand,
      })
        ? opt.imageUrl
        : "",
      productUrl: opt.productUrl || "",
    })),
  }));
}
