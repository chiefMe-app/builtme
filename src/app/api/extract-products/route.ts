import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

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
      max_tokens: 1500,
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
        {"name": "specific product 1", "brand": "Noon/IKEA/Amazon", "price": "XXX", "tier": "budget"},
        {"name": "specific product 2", "brand": "brand", "price": "XXX", "tier": "mid"},
        {"name": "specific product 3", "brand": "brand", "price": "XXX", "tier": "premium"}
      ]
    }
  ]
}
Return max 5 item categories, each with 3 options matching budget ${budget}.`
          }
        ]
      }]
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const text = textBlock?.text || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");
    const parsed = JSON.parse(text.slice(start, end + 1));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to extract products" }, { status: 500 });
  }
}
