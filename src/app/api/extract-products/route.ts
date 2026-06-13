import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { matchCatalogProducts, NeededCategory } from "@/lib/matchCatalogProducts";
import { normalizeFurnitureCategory } from "@/lib/normalizeFurnitureCategory";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ExistingAnalysis {
  style?: string;
  colors?: { name: string; hex: string }[];
  room?: string;
}

interface SelectedChangeItem {
  label?: string;
  category?: string;
  normalizedCategory?: string;
}

// Default generic render descriptions per category — used when categories are
// driven by the user's selected change items rather than reference parsing
const CATEGORY_DEFAULTS: Record<string, { itemName: string; renderDescription: string }> = {
  sofa: { itemName: "Sofa", renderDescription: "comfortable fabric sofa" },
  coffee_table: { itemName: "Coffee Table", renderDescription: "modern coffee table" },
  dining_table: { itemName: "Dining Table", renderDescription: "wooden rectangular dining table" },
  dining_chair: { itemName: "Dining Chairs", renderDescription: "matching dining chairs" },
  chair: { itemName: "Chair", renderDescription: "accent chair" },
  armchair: { itemName: "Armchair", renderDescription: "upholstered armchair" },
  rug: { itemName: "Rug", renderDescription: "area rug" },
  lighting: { itemName: "Lighting", renderDescription: "ceiling pendant light" },
  decor: { itemName: "Decor", renderDescription: "decorative accessories" },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const budget = formData.get("budget") as string;
    const existingAnalysis = JSON.parse((formData.get("existingAnalysis") as string) || "{}") as ExistingAnalysis;
    const selectedChangeItems = JSON.parse((formData.get("selectedChangeItems") as string) || "[]") as SelectedChangeItem[];

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
      imageContents.push({ type: "text", text: `Reference image ${i + 1}:` });
      i++;
    }

    const budgetNumber = parseInt((budget || "").replace(/[^\d]/g, ""), 10) || 20000;

    // SOURCE OF TRUTH: if the user selected change items in the initial analysis,
    // those categories drive the product options. Reference images may only
    // influence style/colour direction — never the category.
    const requestedCategories = selectedChangeItems.length
      ? Array.from(new Set(
          selectedChangeItems
            .map(item => normalizeFurnitureCategory(item.normalizedCategory || item.category || item.label || ""))
            .filter(cat => cat && cat !== "unknown")
        ))
      : [];

    let styleExtracted = existingAnalysis.style || "";
    let styleTags: string[] = [];
    let colorTags: string[] = [];

    // Ask the model ONLY for style direction (tags), not categories
    if (imageContents.length > 0) {
      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: [
              ...imageContents,
              {
                type: "text",
                text: `Describe the STYLE direction of these reference images. Do NOT list furniture categories.
Return ONLY valid JSON:
{ "styleExtracted": "brief style description", "styleTags": ["warm minimal","coastal"], "colorTags": ["cream","beige","natural"] }`,
              },
            ],
          }],
        });
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        const text = textBlock?.text || "";
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          const parsed = JSON.parse(text.slice(s, e + 1));
          styleExtracted = parsed.styleExtracted || styleExtracted;
          styleTags = Array.isArray(parsed.styleTags) ? parsed.styleTags : [];
          colorTags = Array.isArray(parsed.colorTags) ? parsed.colorTags : [];
        }
      } catch (styleErr) {
        console.error("Style extraction failed (non-fatal):", styleErr);
      }
    }

    let neededCategories: NeededCategory[];

    if (requestedCategories.length > 0) {
      // Category-driven: build needs strictly from the selected change items.
      // Style/colour tags from references improve matching but cannot change category.
      neededCategories = requestedCategories.map(cat => {
        const defaults = CATEGORY_DEFAULTS[cat] || { itemName: cat.replace(/_/g, " "), renderDescription: cat.replace(/_/g, " ") };
        return { category: cat, itemName: defaults.itemName, renderDescription: defaults.renderDescription, styleTags, colorTags };
      });
    } else {
      // Fallback (no change items selected): let the model infer categories from references
      neededCategories = [];
      if (imageContents.length > 0) {
        try {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: [
                ...imageContents,
                {
                  type: "text",
                  text: `Identify which furniture/decor categories are needed for this ${existingAnalysis.room || "living room"}.
Return ONLY valid JSON:
{ "neededCategories": [ { "category": "sofa|coffee_table|rug|lighting|decor|dining_table|dining_chair|armchair", "itemName": "...", "renderDescription": "...", "styleTags": [], "colorTags": [] } ] }
Max 5 categories. Do NOT return product URLs or images.`,
                },
              ],
            }],
          });
          const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
          const text = textBlock?.text || "";
          const s = text.indexOf("{"), e = text.lastIndexOf("}");
          if (s !== -1 && e !== -1) {
            neededCategories = (JSON.parse(text.slice(s, e + 1)).neededCategories || []) as NeededCategory[];
          }
        } catch (catErr) {
          console.error("Category inference failed (non-fatal):", catErr);
        }
      }
    }

    const products = matchCatalogProducts({ neededCategories, budget: budgetNumber });

    console.log("[extract-products]", {
      selectedChangeItems,
      requestedCategories,
      returnedCategories: products.map(p => p.category),
    });

    return NextResponse.json({ styleExtracted, products });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to extract products" }, { status: 500 });
  }
}
