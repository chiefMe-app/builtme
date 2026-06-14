import { mapRenovationActionToSurfaceCategory, getSurfaceLabel, type SelectedSurface } from "@/lib/renovationSurfaceCategories";

export interface FinishInput {
  category: string;
  itemName?: string;
  name: string;
  renderDescription: string;
  supplier?: string;
  brand?: string;
}

export type SurfaceFinishEdit = {
  surfaceId: string;
  surfaceCategory: string;
  surfaceLabel: string;
  maskUrl: string;
  bbox: { x: number; y: number; width: number; height: number };
  finishCategory: string;
  finishName: string;
  renderDescription: string;
  supplier?: string;
  brand?: string;
};

/**
 * Pairs each selected finish with its matching selected surface mask.
 * A finish with no matching surface is skipped (returned as a warning) and
 * never silently applied to the whole image.
 */
export function mapFinishesToSurfaces({
  selectedFinishes,
  selectedSurfaces,
}: {
  selectedFinishes: FinishInput[];
  selectedSurfaces: SelectedSurface[];
}): { edits: SurfaceFinishEdit[]; warnings: string[] } {
  const edits: SurfaceFinishEdit[] = [];
  const warnings: string[] = [];

  for (const finish of selectedFinishes) {
    const surfaceCategory = mapRenovationActionToSurfaceCategory(finish.category);
    if (surfaceCategory === "unknown") {
      warnings.push(`No surface mapping for ${finish.category}`);
      continue;
    }
    const surface = selectedSurfaces.find(s => s.category === surfaceCategory);
    if (!surface) {
      warnings.push(`No selected surface for ${getSurfaceLabel(surfaceCategory)} (${finish.name})`);
      continue;
    }
    edits.push({
      surfaceId: surface.id,
      surfaceCategory,
      surfaceLabel: surface.label || getSurfaceLabel(surfaceCategory),
      maskUrl: surface.maskUrl,
      bbox: surface.bbox,
      finishCategory: finish.category,
      finishName: finish.name,
      renderDescription: finish.renderDescription || finish.name,
      supplier: finish.supplier,
      brand: finish.brand,
    });
  }

  return { edits, warnings };
}
