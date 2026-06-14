import type { SurfaceFinishEdit } from "@/lib/mapFinishesToSurfaces";

export interface SurfaceMaskCheck {
  ok: boolean;
  warning?: string;
}

/**
 * Sanity-checks a surface bbox before running a masked edit. A rectangular
 * fallback mask that is too large or the wrong shape tends to make the model
 * paint a floating material panel that covers unrelated objects — better to
 * warn and skip than composite a bad result.
 */
export function validateSurfaceMask(
  edit: SurfaceFinishEdit,
  imageWidth: number,
  imageHeight: number
): SurfaceMaskCheck {
  if (!imageWidth || !imageHeight) return { ok: true };
  const { bbox, surfaceCategory, surfaceLabel } = edit;
  const heightRatio = bbox.height / imageHeight;
  const areaRatio = (bbox.width * bbox.height) / (imageWidth * imageHeight);

  const tooLarge = (label: string) =>
    ({ ok: false, warning: `${label} mask is too large and may affect nearby objects. Please reselect a tighter ${label.toLowerCase()} area.` });

  // Polygon masks follow the real surface shape — skip the rectangular
  // height/area heuristics; only guard against an extreme/degenerate selection.
  if (edit.maskType === "polygon") {
    if (areaRatio < 0.002) return { ok: false, warning: `${surfaceLabel} polygon is too small. Please draw a larger area.` };
    if (areaRatio > 0.97) return { ok: false, warning: `${surfaceLabel} polygon covers almost the whole image. Please draw a tighter area.` };
    return { ok: true };
  }

  switch (surfaceCategory) {
    case "countertop":
      // Countertops are shallow horizontal bands
      if (heightRatio > 0.45) return tooLarge(surfaceLabel);
      break;
    case "backsplash":
      // Backsplash is a horizontal band between counter and uppers
      if (heightRatio > 0.5) return tooLarge(surfaceLabel);
      break;
    case "hardware_taps":
      // Hardware is small
      if (areaRatio > 0.12) return tooLarge(surfaceLabel);
      break;
    default:
      // Floor / cabinets / lighting: only reject if it covers nearly everything
      if (areaRatio > 0.92) return tooLarge(surfaceLabel);
  }

  return { ok: true };
}
