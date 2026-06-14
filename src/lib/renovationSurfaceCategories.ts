export type RenovationSurfaceCategory =
  | "countertop"
  | "cabinet_doors"
  | "backsplash"
  | "floor"
  | "hardware_taps"
  | "lighting"
  | "unknown";

export type SelectedSurface = {
  id: string;
  category: RenovationSurfaceCategory;
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
  maskUrl: string;
  originalBbox?: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
  wasExpanded?: boolean;
  usedFallbackMask?: boolean;
  polygon?: Array<{ x: number; y: number }>;
  maskType?: "bbox" | "polygon" | "segmentation";
};

/** Maps a renovation action/material category to the surface it edits. */
export function mapRenovationActionToSurfaceCategory(actionCategory: string): RenovationSurfaceCategory {
  const value = (actionCategory || "").toLowerCase();

  if (value.includes("countertop")) return "countertop";
  if (value.includes("cabinet")) return "cabinet_doors";
  if (value.includes("backsplash") || value.includes("tile_sticker")) return "backsplash";
  if (value.includes("floor")) return "floor";
  if (value.includes("handle") || value.includes("tap") || value.includes("hardware") || value.includes("faucet")) return "hardware_taps";
  if (value.includes("lighting") || value.includes("light")) return "lighting";

  return "unknown";
}

export function getSurfaceLabel(category: RenovationSurfaceCategory): string {
  switch (category) {
    case "countertop": return "Countertop";
    case "cabinet_doors": return "Cabinet doors";
    case "backsplash": return "Backsplash";
    case "floor": return "Floor";
    case "hardware_taps": return "Handles & taps";
    case "lighting": return "Lighting";
    default: return "Surface";
  }
}
