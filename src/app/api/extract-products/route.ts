import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { matchCatalogProducts, NeededCategory } from "@/lib/matchCatalogProducts";

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

    // The LLM only identifies WHICH product categories are needed and the style
    // direction. Actual products, prices, links and images come from the
    // curated catalog — never invented by the model.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: `Analyse these style reference images and identify which furniture/decor categories are needed to achieve this look.

Room type: ${existingAnalysis.room || "living room"}
Style: ${existingAnalysis.style || "modern"}
Budget: ${budget || "mid-range"}

Return ONLY valid JSON:
{
  "styleExtracted": "brief style description",
  "neededCategories": [
    {
      "category": "sofa | coffee_table | rug | lighting | decor | dining_table | dining_chair | armchair",
      "itemName": "generic item name e.g. '3-seat sofa'",
      "renderDescription": "description for AI render e.g. 'cream linen 3-seat sofa'",
      "styleTags": ["warm minimal", "coastal", "neutral"],
      "colorTags": ["cream", "beige", "natural"]
    }
  ]
}

Rules:
- Max 5 categories, only ones relevant to the room type and visible in the references.
- Do NOT return product image URLs, product URLs, or specific retail products.
- Only describe what KIND of product is needed.`
          }
        ]
      }]
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Category extraction response was truncated (max_tokens) — JSON would be incomplete");
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const text = textBlock?.text || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");
    const parsed = JSON.parse(text.slice(start, end + 1));

    // Match needs against the curated catalog (source of truth for products)
    const neededCategories = (parsed.neededCategories || []) as NeededCategory[];
    const budgetNumber = parseInt((budget || "").replace(/[^\d]/g, ""), 10) || 20000;
    const products = matchCatalogProducts({ neededCategories, budget: budgetNumber });

    return NextResponse.json({
      styleExtracted: parsed.styleExtracted || "",
      products,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to extract products" }, { status: 500 });
  }
}
