import type { RenovationSurfaceCategory } from "./renovationSurfaceCategories";

export type BBox = { x: number; y: number; width: number; height: number };

// Per-surface expansion multipliers (fraction of the initial bbox added on each side)
const EXPANSION: Record<RenovationSurfaceCategory, { left: number; right: number; up: number; down: number }> = {
  countertop:     { left: 1.5, right: 1.5, up: 0.3, down: 0.3 },
  cabinet_doors:  { left: 0.8, right: 0.8, up: 0.8, down: 0.8 },
  backsplash:     { left: 1.8, right: 1.8, up: 0.6, down: 0.6 },
  floor:          { left: 1.2, right: 1.2, up: 0.4, down: 1.5 },
  hardware_taps:  { left: 0.3, right: 0.3, up: 0.3, down: 0.3 },
  lighting:       { left: 0.8, right: 0.8, up: 0.8, down: 0.8 },
  unknown:        { left: 0.5, right: 0.5, up: 0.5, down: 0.5 },
};

export function expandRenovationSurfaceBbox({
  bbox,
  category,
  imageWidth,
  imageHeight,
}: {
  bbox: BBox;
  category: RenovationSurfaceCategory;
  imageWidth: number;
  imageHeight: number;
}): BBox {
  const e = EXPANSION[category] || EXPANSION.unknown;

  const newX = bbox.x - bbox.width * e.left;
  const newY = bbox.y - bbox.height * e.up;
  const newWidth = bbox.width * (1 + e.left + e.right);
  const newHeight = bbox.height * (1 + e.up + e.down);

  const clampedX = Math.max(0, Math.round(newX));
  const clampedY = Math.max(0, Math.round(newY));
  const clampedWidth = Math.min(imageWidth - clampedX, Math.round(newWidth));
  const clampedHeight = Math.min(imageHeight - clampedY, Math.round(newHeight));

  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(1, clampedWidth),
    height: Math.max(1, clampedHeight),
  };
}

export function getSurfaceBboxAreaRatio({
  bbox,
  imageWidth,
  imageHeight,
}: {
  bbox: BBox;
  imageWidth: number;
  imageHeight: number;
}): number {
  return (bbox.width * bbox.height) / (imageWidth * imageHeight);
}
