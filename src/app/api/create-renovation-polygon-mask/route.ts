import { NextRequest, NextResponse } from "next/server";
import { createPolygonMask, bboxFromPolygon } from "@/lib/createPolygonMask";
import { getSurfaceLabel, type RenovationSurfaceCategory } from "@/lib/renovationSurfaceCategories";

export const maxDuration = 60;

interface PolygonRequest {
  category: RenovationSurfaceCategory;
  label?: string;
  polygon: Array<{ x: number; y: number }>;
  imageWidth: number;
  imageHeight: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PolygonRequest;
    const { category, polygon, imageWidth, imageHeight } = body;

    if (!polygon || polygon.length < 3 || !imageWidth || !imageHeight) {
      return NextResponse.json({ error: "A polygon with at least 3 points and image dimensions are required" }, { status: 400 });
    }

    const maskUrl = await createPolygonMask({ polygon, imageWidth, imageHeight });
    const bbox = bboxFromPolygon(polygon);

    console.log("[renovation-polygon-mask]", { category, points: polygon.length, bbox });

    return NextResponse.json({
      id: `surface_${Date.now()}_${Math.round(Math.random() * 1e4)}`,
      category,
      label: body.label || getSurfaceLabel(category),
      polygon,
      maskUrl,
      bbox,
      imageWidth,
      imageHeight,
      maskType: "polygon",
      usedFallbackMask: false,
      wasExpanded: false,
    });
  } catch (err) {
    console.error("Polygon mask error:", err);
    return NextResponse.json({ error: "Could not create the polygon mask. Please try again." }, { status: 500 });
  }
}
