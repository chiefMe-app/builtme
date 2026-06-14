import { NextRequest, NextResponse } from "next/server";
import { createBboxMask } from "@/lib/bboxMask";
import { expandRenovationSurfaceBbox } from "@/lib/expandRenovationSurfaceBbox";
import {
  getSurfaceLabel,
  type RenovationSurfaceCategory,
} from "@/lib/renovationSurfaceCategories";

export const maxDuration = 60;

interface SurfaceRequest {
  imageUrl: string;
  clickX: number;
  clickY: number;
  imageWidth: number;
  imageHeight: number;
  targetSurfaceCategory: RenovationSurfaceCategory;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SurfaceRequest;
    const { clickX, clickY, imageWidth, imageHeight, targetSurfaceCategory } = body;

    if (clickX === undefined || clickY === undefined || !imageWidth || !imageHeight) {
      return NextResponse.json({ error: "clickX, clickY, imageWidth and imageHeight are required" }, { status: 400 });
    }

    const category = (targetSurfaceCategory || "unknown") as RenovationSurfaceCategory;

    // MVP: no real surface segmentation provider — start with a small bbox around
    // the click, then expand it according to the surface category. This is a
    // fallback, not precise segmentation.
    // TODO: replace with a real surface segmentation model (e.g. SAM2 box prompts
    // or a material-segmentation provider) for tight per-surface masks.
    const initW = Math.max(8, Math.round(imageWidth * 0.1));
    const initH = Math.max(8, Math.round(imageHeight * 0.08));
    const originalBbox = {
      x: Math.max(0, Math.round(clickX - initW / 2)),
      y: Math.max(0, Math.round(clickY - initH / 2)),
      width: initW,
      height: initH,
    };

    const expandedBbox = expandRenovationSurfaceBbox({ bbox: originalBbox, category, imageWidth, imageHeight });
    const maskUrl = await createBboxMask({ bbox: expandedBbox, imageWidth, imageHeight });

    console.log("[renovation-surface-selection]", {
      targetSurfaceCategory: category,
      originalBbox,
      expandedBbox,
      usedFallbackMask: true,
    });

    return NextResponse.json({
      id: `surface_${Date.now()}_${Math.round(Math.random() * 1e4)}`,
      category,
      label: getSurfaceLabel(category),
      maskUrl,
      bbox: expandedBbox,
      originalBbox,
      imageWidth,
      imageHeight,
      wasExpanded: true,
      usedFallbackMask: true,
    });
  } catch (err) {
    console.error("Renovation surface selection error:", err);
    return NextResponse.json({ error: "Could not select that surface. Please try again." }, { status: 500 });
  }
}
