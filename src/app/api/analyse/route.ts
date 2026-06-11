import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

function buildPrompt(
  category: string,
  budget: string,
  prompt: string,
  userType: string,
  selectedItems: string[],
  selectedMinorItems: string[],
  selectedRooms: string[],
  locationArea: string,
  propertyType: string,
  propertySize: string,
) {
  let typeInstruction = "";
  if (userType === "styling") {
    typeInstruction = `User wants to change these specific items: ${selectedItems.join(", ")}. Only recommend changes for these items. Do not suggest structural changes.`;
  } else if (userType === "minor_reno") {
    typeInstruction = `User selected these specific renovation options: ${selectedMinorItems.join(", ")}. Provide real vs budget alternatives for each selected item.`;
  } else if (userType === "empty_flat") {
    typeInstruction = `Empty flat styling for rooms: ${selectedRooms.join(", ")}. Provide full furniture and styling recommendations for each room.`;
  } else if (userType === "full_reno") {
    typeInstruction = `Full renovation project. Include contractor matching as priority output.`;
  }

  const userTypeInstructions: Record<string, string> = {
    styling: "Focus ONLY on furniture, lighting, decor and accessories. Do NOT suggest structural changes, tiling, or plumbing. The user wants to restyle without construction.",
    minor_reno: "Focus on the specific renovation items selected. For each item provide real vs budget-friendly alternative. Include accessories and finishing touches in furniture array.",
    empty_flat: "This is an empty flat that needs full styling. Provide room-by-room furniture recommendations. Populate the spaceAnalysis.rooms array with each room and its furniture needs.",
    full_reno: "This is a full renovation. Include structural scope, MEP considerations, and contractor requirements. Prioritize materials and contractor matching.",
  };

  const instruction = userTypeInstructions[userType] || "";

  return `You are BuiltMe AI. Generate a Dubai home renovation package as valid JSON ONLY. No markdown, no backticks, no explanation. Start with { and end with }.

PROJECT: ${category}, ${budget}, Dubai UAE
VISION: "${prompt || "Modern, clean and functional space"}"
${typeInstruction}

USER TYPE SPECIFIC INSTRUCTIONS: ${instruction}

PROPERTY LOCATION: ${locationArea}, Dubai
PROPERTY TYPE: ${propertyType}
${propertySize ? `APPROXIMATE SIZE: ${propertySize} sqft` : ""}

Generate a project title that includes the property type and area. For example: "Marina Apartment Kitchen Refresh" or "Palm Villa Living Room Transformation"

Return ONLY this JSON, max 3 items per array:
{"styleProfile":{"dominantStyle":"","colorPalette":[{"name":"","hex":"","usage":""}],"moodKeywords":["","",""],"designDirection":""},"designConcept":{"projectTitle":"descriptive title including property type and area e.g. 'JBR Apartment Boho Kitchen'","description":"","beforeAfterNarrative":""},"scope":{"summary":"","workItems":[{"category":"","items":["",""]}]},"materials":[{"zone":"","item":"","specification":"","supplier":"","supplierArea":"","priceRange":"","quantity":"","totalCost":""}],"furniture":[{"item":"","brand":"","model":"","quantity":1,"priceAED":0,"totalPriceAED":0,"buyLink":"","imageSearchTerm":"","alternative":"","altPriceAED":0}],"costBreakdown":{"materials":0,"furniture":0,"labour":0,"contingency":0,"total":0,"currency":"AED"},"timeline":[{"week":"Week 1","tasks":["",""]}],"supplierMap":[{"name":"","category":"","area":"","website":""}],"nextSteps":["","",""]}`;
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
    const userType = String(formData.get("userType") ?? "");
    const selectedItems = JSON.parse(String(formData.get("selectedItems") ?? "[]")) as string[];
    const selectedMinorItems = JSON.parse(String(formData.get("selectedMinorItems") ?? "[]")) as string[];
    const selectedRooms = JSON.parse(String(formData.get("selectedRooms") ?? "[]")) as string[];
    const locationArea = String(formData.get("locationArea") ?? "") || "Dubai";
    const propertyType = String(formData.get("propertyType") ?? "") || "apartment";
    const propertySize = String(formData.get("propertySize") ?? "");
    const userId = formData.get("userId") ? String(formData.get("userId")) : null;

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

    content.push({ type: "text", text: buildPrompt(category, budget, prompt, userType, selectedItems, selectedMinorItems, selectedRooms, locationArea, propertyType, propertySize) });

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
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
    console.log("CLAUDE RAW RESPONSE:", textBlock.text);
    try {
      let text = textBlock.text.trim();
      // Remove markdown code blocks if present
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      // Find first { and last } to extract JSON
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) {
        throw new Error('No JSON object found in response');
      }
      text = text.slice(start, end + 1);
      result = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Claude response as JSON", raw: textBlock.text },
        { status: 502 },
      );
    }

    // Run once in the Supabase SQL editor to support user-owned projects:
    // ALTER TABLE builtme_projects ADD COLUMN user_id uuid references auth.users;
    // ALTER TABLE builtme_projects ADD COLUMN title text;
    // ALTER TABLE builtme_projects ADD COLUMN renders jsonb;
    // ALTER TABLE builtme_projects ADD COLUMN IF NOT EXISTS room_photo_url text;
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase.from("builtme_projects").insert({
        user_id: userId,
        category,
        budget,
        prompt,
        result,
        title: (result as { designConcept?: { projectTitle?: string } })?.designConcept?.projectTitle,
        renders: [],
        created_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
      // Don't fail the request if DB save fails
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
