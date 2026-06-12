import { NextRequest, NextResponse } from "next/server";
import { expandFurnitureBbox, getBboxAreaRatio, type BBox } from "@/lib/expandFurnitureBbox";
import { createBboxMask } from "@/lib/bboxMask";

export const maxDuration = 60;

interface ExpandSelectionRequest {
  bbox: BBox;
  category?: string | null;
  imageWidth: number;
  imageHeight: number;
}

export async function POST(req: NextRequest) {
  try {
    const { bbox, category, imageWidth, imageHeight } = (await req.json()) as ExpandSelectionRequest;

    if (!bbox || !imageWidth || !imageHeight) {
      return NextResponse.json({ error: "bbox, imageWidth and imageHeight are required" }, { status: 400 });
    }

    const expandedBbox = expandFurnitureBbox({ bbox, category, imageWidth, imageHeight });
    const maskUrl = await createBboxMask({ bbox: expandedBbox, imageWidth, imageHeight });
    const bboxAreaRatioBefore = getBboxAreaRatio({ bbox, imageWidth, imageHeight });
    const bboxAreaRatioAfter = getBboxAreaRatio({ bbox: expandedBbox, imageWidth, imageHeight });

    console.log("[strict-selection]", {
      category: category || "unknown",
      originalBbox: bbox,
      expandedBbox,
      bboxAreaRatioBefore,
      bboxAreaRatioAfter,
      maskUrlExists: Boolean(maskUrl),
      wasExpanded: true,
      usedFallbackMask: true,
    });

    return NextResponse.json({
      bbox: expandedBbox,
      maskUrl,
      wasExpanded: true,
      bboxAreaRatioAfter,
    });
  } catch (err) {
    console.error("Expand selection error:", err);
    return NextResponse.json({ error: "Could not expand selection" }, { status: 500 });
  }
}
