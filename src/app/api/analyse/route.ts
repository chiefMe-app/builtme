import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

async function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");
  return { data, mediaType: file.type || "application/octet-stream" };
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function buildPrompt(category: string, budget: string, prompt: string) {
  return `You are BuiltMe AI, a Dubai renovation assistant. Generate a renovation package as JSON ONLY (no markdown, no backticks).

PROJECT: ${category} renovation, ${budget} budget, Dubai UAE
VISION: "${prompt || "Modern, clean and functional space"}"

Respond with ONLY this JSON structure, keep each array to maximum 3 items:
{
  "styleProfile": {
    "dominantStyle": "style name",
    "colorPalette": [{"name": "color name", "hex": "#XXXXXX", "usage": "where used"}],
    "moodKeywords": ["word1", "word2", "word3"],
    "designDirection": "2 sentence description"
  },
  "designConcept": {
    "title": "concept name",
    "description": "2 sentence description",
    "beforeAfterNarrative": "one sentence"
  },
  "materials": [
    {"zone": "zone", "item": "item", "specification": "spec", "supplier": "Dubai supplier", "supplierArea": "area", "priceRange": "AED XX-XX", "quantity": "qty", "totalCost": "AED XXXXX"}
  ],
  "furniture": [
    {"item": "piece", "brand": "brand", "model": "model", "priceAED": 0, "buyLink": "https://", "alternative": "alt brand", "altPriceAED": 0}
  ],
  "costBreakdown": {"materials": 0, "furniture": 0, "labour": 0, "contingency": 0, "total": 0, "currency": "AED"},
  "timeline": [{"week": "Week 1", "tasks": ["task1", "task2"]}],
  "supplierMap": [{"name": "supplier", "category": "category", "area": "Dubai area", "website": "url"}],
  "nextSteps": ["step1", "step2", "step3"]
}`;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const formData = await request.formData();

    const category = String(formData.get("category") ?? "");
    const budget = String(formData.get("budget") ?? "");
    const prompt = String(formData.get("prompt") ?? "");

    const floorPlan = formData.get("floorPlan");
    const referenceImages = formData
      .getAll("referenceImages")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)
      .slice(0, 3);

    const content: Anthropic.ContentBlockParam[] = [];

    if (floorPlan instanceof File && floorPlan.size > 0) {
      const { data, mediaType } = await fileToBase64(floorPlan);
      if (mediaType === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        });
      } else if (SUPPORTED_IMAGE_TYPES.has(mediaType)) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data,
          },
        });
      } else {
        return NextResponse.json(
          { error: `Unsupported floor plan file type: ${mediaType}` },
          { status: 400 },
        );
      }
    }

    for (const ref of referenceImages) {
      const { data, mediaType } = await fileToBase64(ref);
      if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
        return NextResponse.json(
          { error: `Unsupported reference image type: ${mediaType}` },
          { status: 400 },
        );
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data,
        },
      });
    }

    content.push({ type: "text", text: buildPrompt(category, budget, prompt) });

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (!textBlock) {
      return NextResponse.json(
        { error: "No text response received from Claude" },
        { status: 502 },
      );
    }

    let result: unknown;
    try {
      const clean = textBlock.text.replace(/```json|```/g, "").trim();
      result = JSON.parse(clean);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Claude response as JSON" },
        { status: 502 },
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error: ${error.message}` },
        { status: error.status ?? 500 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
