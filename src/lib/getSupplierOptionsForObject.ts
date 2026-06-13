import { CatalogProduct } from "@/data/uaeFurnitureCatalog";
import { isCompatibleReplacement } from "@/lib/isCompatibleReplacement";

export interface SupplierGroup {
  supplier: string;
  options: CatalogProduct[];
}

/**
 * Builds supplier-grouped replacement options for a selected object's category.
 * Only catalog products compatible with the object category are included, so
 * the active object never shows a mixed-category product list.
 */
export function getSupplierOptionsForObject({
  selectedObjectCategory,
  catalog,
}: {
  selectedObjectCategory: string;
  catalog: CatalogProduct[];
}): SupplierGroup[] {
  const matching = catalog.filter((p) =>
    isCompatibleReplacement(selectedObjectCategory, p.category)
  );

  const bySupplier = new Map<string, CatalogProduct[]>();
  for (const product of matching) {
    const list = bySupplier.get(product.supplier) || [];
    list.push(product);
    bySupplier.set(product.supplier, list);
  }

  return Array.from(bySupplier.entries()).map(([supplier, options]) => ({
    supplier,
    // Cheapest first within a supplier so budget → premium reads naturally
    options: options.sort((a, b) => a.price - b.price),
  }));
}
