export interface StrictRenderValidation {
  passed: boolean;
  precisionScore: number;
  warnings: string[];
}

/**
 * Lightweight metadata checks for Restyle Room renders.
 * TODO: extend with image-based validation (compare before/after object types).
 */
export function validateRestyleRenderMetadata({
  selectedCategories,
}: {
  selectedCategories: string[];
}) {
  const warnings: string[] = [];

  if (selectedCategories.includes("dining_table")) {
    warnings.push("Check that dining table remains a dining table and was not converted to console/sideboard.");
  }

  if (!selectedCategories.includes("tv_unit")) {
    warnings.push("Do not introduce a new TV unit/console unless selected.");
  }

  return {
    passed: true,
    warnings,
  };
}

/**
 * MVP validation for strict-replacement renders.
 * Outside-mask preservation itself is guaranteed structurally: the final image
 * is composited from the original photo outside the mask (see imageComposite.ts),
 * so validation focuses on the mask/bbox being sane and the output existing.
 */
export function validateStrictRender(params: {
  maskUrl: string | null;
  maskArea?: number; // fraction of image covered by mask (0..1), if known
  bbox: { x: number; y: number; width: number; height: number } | null;
  imageWidth?: number;
  imageHeight?: number;
  finalImageCreated: boolean;
}): StrictRenderValidation {
  const warnings: string[] = [];
  let score = 1;

  if (!params.maskUrl) {
    warnings.push("No mask was provided");
    score -= 0.5;
  }

  if (params.maskArea !== undefined) {
    if (params.maskArea <= 0.001) {
      warnings.push("Mask is empty or nearly empty");
      score -= 0.4;
    } else if (params.maskArea > 0.8) {
      warnings.push("Mask covers most of the image — selection may be too broad");
      score -= 0.3;
    }
  }

  if (!params.bbox || params.bbox.width <= 0 || params.bbox.height <= 0) {
    warnings.push("Bounding box is missing or invalid");
    score -= 0.3;
  } else if (params.imageWidth && params.imageHeight) {
    const areaFrac =
      (params.bbox.width * params.bbox.height) / (params.imageWidth * params.imageHeight);
    if (areaFrac > 0.9) {
      warnings.push("Bounding box covers almost the whole image");
      score -= 0.2;
    }
  }

  if (!params.finalImageCreated) {
    warnings.push("Final composited image was not created");
    score = 0;
  }

  const precisionScore = Math.max(0, Math.min(1, score));
  return {
    passed: params.finalImageCreated && !!params.maskUrl && precisionScore >= 0.5,
    precisionScore,
    warnings,
  };
}
