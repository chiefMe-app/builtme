import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { enrichProductImages } from "@/lib/productImageEnrichment";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ExistingAnalysis {
  style?: string;
  colors?: { name: string; hex: string }[];
  room?: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const budget = formData.get("budget") as string;
    const existingAnalysis = JSON.parse((formData.get("existingAnalysis") as string) || "{}") as ExistingAnalysis;

    const imageContents: Anthropic.ContentBlockParam[] = [];
    let i = 0;
    while (formData.get(`reference_${i}`)) {
      const file = formData.get(`reference_${i}`) as File;
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64,
        },
      });
      imageContents.push({
        type: "text",
        text: `Reference image ${i + 1}:`,
      });
      i++;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: `Analyse these style reference images and identify the key furniture and decor items visible.

For each item, find the equivalent product available in Dubai (Noon.com, Amazon AE, IKEA UAE, Home Centre UAE, 2XL Furniture).

Room type: ${existingAnalysis.room || "living room"}
Style: ${existingAnalysis.style || "modern"}
Budget: ${budget || "mid-range"}

Return ONLY valid JSON:
{
  "styleExtracted": "brief description of the style seen in references",
  "products": [
    {
      "category": "sofa/coffee table/rug/lighting/decor",
      "itemName": "generic item name e.g. '3-Seat Sofa'",
      "renderDescription": "description for render e.g. 'cream linen 3-seat sofa'",
      "options": [
        {"name": "specific product 1", "brand": "IKEA UAE / Amazon AE / Noon / Home Centre / 2XL / etc.", "price": "XXX", "tier": "budget", "productUrl": "", "imageUrl": ""},
        {"name": "specific product 2", "brand": "brand", "price": "XXX", "tier": "mid", "productUrl": "", "imageUrl": ""},
        {"name": "specific product 3", "brand": "brand", "price": "XXX", "tier": "premium", "productUrl": "", "imageUrl": ""}
      ]
    }
  ]
}
Return max 5 item categories, each with 3 options matching budget ${budget}.

URL rules (critical):
- Only fill productUrl or imageUrl if you are CONFIDENT it is a real, direct URL for that exact product.
- If unsure, return an empty string "".
- NEVER invent or guess URLs. NEVER use unrelated images or generic web images.
- An empty imageUrl is always better than a wrong one.`
          }
        ]
      }]
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Product extraction response was truncated (max_tokens) — JSON would be incomplete");
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const text = textBlock?.text || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");
    const parsed = JSON.parse(text.slice(start, end + 1));

    // Blank any image/product URLs that aren't from trusted shop domains —
    // the UI then falls back to safe local category images
    if (Array.isArray(parsed.products)) {
      parsed.products = await enrichProductImages(parsed.products);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to extract products" }, { status: 500 });
  }
}
