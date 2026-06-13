import { NextRequest, NextResponse } from "next/server";
import { searchProductsOnline, isOnlineSearchConfigured } from "@/lib/productSearchProvider";

export const maxDuration = 60;

interface SearchRequest {
  category: string;
  styleTags?: string[];
  colorTags?: string[];
  budget?: number;
  suppliers?: string[];
}

export async function POST(req: NextRequest) {
  try {
    if (!isOnlineSearchConfigured()) {
      return NextResponse.json({ products: [], provider: "none", configured: false, category: "" });
    }

    const body = (await req.json()) as SearchRequest;
    if (!body.category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const products = await searchProductsOnline({
      category: body.category,
      styleTags: body.styleTags,
      colorTags: body.colorTags,
      budget: body.budget,
      suppliers: body.suppliers,
    });

    return NextResponse.json({ products, provider: "serpapi", configured: true, category: body.category });
  } catch (err) {
    console.error("Product search error:", err);
    return NextResponse.json({ error: "Product search failed" }, { status: 500 });
  }
}
