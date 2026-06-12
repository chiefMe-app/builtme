export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Category-aware bbox expansion: when segmentation grabs only part of a
 * furniture object (one sofa cushion, one rug patch), expand the bbox so the
 * mask covers the full object instance to be replaced.
 */
export function expandFurnitureBbox({
  bbox,
  category,
  imageWidth,
  imageHeight,
}: {
  bbox: BBox;
  category?: string | null;
  imageWidth: number;
  imageHeight: number;
}): BBox {
  const normalized = (category || "unknown").toLowerCase().replace(/\s+/g, "_");

  let expandLeft = 0.4;
  let expandRight = 0.4;
  let expandUp = 0.4;
  let expandDown = 0.4;

  if (normalized.includes("sofa") || normalized.includes("couch")) {
    expandLeft = 1.5;
    expandRight = 1.5;
    expandUp = 0.8;
    expandDown = 0.4;
  } else if (normalized.includes("armchair") || normalized.includes("chair")) {
    expandLeft = 0.4;
    expandRight = 0.4;
    expandUp = 0.4;
    expandDown = 0.4;
  } else if (normalized.includes("coffee_table")) {
    expandLeft = 0.4;
    expandRight = 0.4;
    expandUp = 0.4;
    expandDown = 0.4;
  } else if (normalized.includes("rug") || normalized.includes("carpet")) {
    expandLeft = 1.0;
    expandRight = 1.0;
    expandUp = 1.0;
    expandDown = 1.0;
  } else if (normalized.includes("light") || normalized.includes("pendant")) {
    expandLeft = 0.8;
    expandRight = 0.8;
    expandUp = 0.8;
    expandDown = 0.8;
  }

  const newX = bbox.x - bbox.width * expandLeft;
  const newY = bbox.y - bbox.height * expandUp;
  const newWidth = bbox.width * (1 + expandLeft + expandRight);
  const newHeight = bbox.height * (1 + expandUp + expandDown);

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

export function getBboxAreaRatio({
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

/** Minimum plausible image-area ratio for a full object of the given category. */
export function isBboxTooSmallForCategory({
  bbox,
  category,
  imageWidth,
  imageHeight,
}: {
  bbox: BBox;
  category?: string | null;
  imageWidth: number;
  imageHeight: number;
}): boolean {
  const normalized = (category || "unknown").toLowerCase().replace(/\s+/g, "_");
  const ratio = getBboxAreaRatio({ bbox, imageWidth, imageHeight });

  if (normalized.includes("sofa") || normalized.includes("couch")) {
    return ratio < 0.08;
  }
  if (normalized.includes("rug") || normalized.includes("carpet")) {
    return ratio < 0.1;
  }
  if (normalized.includes("coffee_table")) {
    return ratio < 0.015;
  }
  if (normalized.includes("armchair") || normalized.includes("chair")) {
    return ratio < 0.015;
  }
  if (normalized.includes("light") || normalized.includes("pendant")) {
    return ratio < 0.005;
  }
  return ratio < 0.01;
}
