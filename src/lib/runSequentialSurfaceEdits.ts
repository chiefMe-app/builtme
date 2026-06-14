import { runMaskedImageEdit } from "@/lib/falStrictEdit";
import { compositeMaskedEdit } from "@/lib/imageComposite";
import { buildSurfaceEditPrompt } from "@/lib/buildSurfaceEditPrompt";
import { validateSurfaceMask } from "@/lib/validateSurfaceMask";
import type { SurfaceFinishEdit } from "@/lib/mapFinishesToSurfaces";

/**
 * Applies each surface finish in its own masked pass, compositing the result
 * back so everything outside the active mask stays identical. Each edit sees
 * the composited output of the previous edit.
 *
 * `uploadImage` persists a composited buffer and returns its public URL (so the
 * next pass can use it as input) — injected to keep this storage-agnostic.
 */
export async function runSequentialSurfaceEdits({
  baseImageUrl,
  edits,
  uploadImage,
}: {
  baseImageUrl: string;
  edits: SurfaceFinishEdit[];
  uploadImage: (buffer: Buffer) => Promise<string>;
}): Promise<{ finalImageUrl: string; appliedEdits: SurfaceFinishEdit[]; warnings: string[] }> {
  let currentImageUrl = baseImageUrl;
  const appliedEdits: SurfaceFinishEdit[] = [];
  const warnings: string[] = [];

  for (const edit of edits) {
    // Skip masks that are too large / wrong-shape — they tend to produce
    // floating material panels covering unrelated objects
    const check = validateSurfaceMask(edit, edit.imageWidth, edit.imageHeight);
    if (!check.ok) {
      console.warn("[surface-edit] skipped:", check.warning);
      warnings.push(check.warning || `Skipped ${edit.surfaceLabel} (mask too large)`);
      continue;
    }
    const prompt = buildSurfaceEditPrompt(edit);
    try {
      // 1. Masked model edit (may repaint the whole frame)
      const generatedUrl = await runMaskedImageEdit({ imageUrl: currentImageUrl, maskUrl: edit.maskUrl, prompt });
      // 2. Composite: keep everything outside the mask from the current image
      const compositedBuf = await compositeMaskedEdit({
        originalImageUrl: currentImageUrl,
        generatedImageUrl: generatedUrl,
        maskUrl: edit.maskUrl,
      });
      // 3. Persist and chain
      currentImageUrl = await uploadImage(compositedBuf);
      appliedEdits.push(edit);
    } catch (err) {
      console.error(`[surface-edit] failed for ${edit.surfaceCategory}:`, err);
      warnings.push(`Could not apply ${edit.surfaceLabel} finish (${edit.finishName})`);
      // Preserve prior successful edits; continue with remaining surfaces
    }
  }

  return { finalImageUrl: currentImageUrl, appliedEdits, warnings };
}
