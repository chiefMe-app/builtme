import { applyMaterialToMask } from "@/lib/applyMaterialToMask";
import { validateSurfaceMask } from "@/lib/validateSurfaceMask";
import type { SurfaceFinishEdit } from "@/lib/mapFinishesToSurfaces";

/**
 * Applies every selected finish deterministically inside its surface mask,
 * one after another. Fast, no AI — guarantees the chosen material is the one
 * shown. Everything outside each mask is preserved exactly.
 */
export async function runSafeMaterialPreview({
  baseImageUrl,
  edits,
}: {
  baseImageUrl: string;
  edits: SurfaceFinishEdit[];
}): Promise<{ finalPreviewUrl: string; appliedEdits: SurfaceFinishEdit[]; warnings: string[] }> {
  let currentImageUrl = baseImageUrl;
  const appliedEdits: SurfaceFinishEdit[] = [];
  const warnings: string[] = [];

  for (const edit of edits) {
    // Hardware on an oversized mask would tint a big region — skip and warn
    const check = validateSurfaceMask(edit, edit.imageWidth, edit.imageHeight);
    if (!check.ok) {
      warnings.push(check.warning || `Skipped ${edit.surfaceLabel}`);
      continue;
    }
    try {
      currentImageUrl = await applyMaterialToMask({
        imageUrl: currentImageUrl,
        maskUrl: edit.maskUrl,
        material: {
          category: edit.finishCategory,
          name: edit.finishName,
          renderDescription: edit.renderDescription,
        },
      });
      appliedEdits.push(edit);
    } catch (err) {
      console.error(`[safe-preview] failed for ${edit.surfaceCategory}:`, err);
      warnings.push(`Could not apply ${edit.surfaceLabel} finish (${edit.finishName})`);
    }
  }

  return { finalPreviewUrl: currentImageUrl, appliedEdits, warnings };
}
