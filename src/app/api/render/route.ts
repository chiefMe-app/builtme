import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const productsPrompt = (formData.get("productsPrompt") as string) || "";
    const renderPromptExtra = (formData.get("renderPromptExtra") as string) || "";
    const whatToChangeRaw = formData.get("whatToChange") as string | null;
    const whatToChange: string[] = whatToChangeRaw ? JSON.parse(whatToChangeRaw) : [];
    const imageFile = formData.get("image") as File | null;

    if (!imageFile || imageFile.size === 0) {
      return NextResponse.json({ error: "Please upload a photo of your room" }, { status: 400 });
    }

    // Upload image to Supabase Storage first
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `render-input-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("builtme-uploads")
      .upload(fileName, buffer, {
        contentType: imageFile.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("builtme-uploads")
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    // Build explicit keep list from what user did NOT select
    const allPossibleItems = [
      "sofa and seating", "dining table and chairs", "lighting fixtures",
      "wall colour", "rugs", "curtains", "coffee table", "TV unit",
      "decorative accessories", "kitchen", "kitchen appliances",
      "doorways and passages", "architectural openings"
    ];

    const changeLabels: Record<string, string> = {
      sofa: "sofa and seating",
      dining: "dining table and chairs",
      lighting: "lighting fixtures",
      wall_colour: "wall colour",
      rug: "rugs",
      curtains: "curtains",
      coffee_table: "coffee table",
      tv_unit: "TV unit",
      decor: "decorative accessories",
    };

    const changingItems = (whatToChange || []).map((id: string) => changeLabels[id]).filter(Boolean);
    const keepingItems = allPossibleItems.filter(item => !changingItems.includes(item));

    const editPrompt = `Make MINIMAL edits to this room photo.

CHANGE ONLY these specific items: ${changingItems.length > 0 ? changingItems.join(", ") : "furniture style and decor"}.

DO NOT TOUCH OR REMOVE these items - they must remain exactly as they are:
${keepingItems.join(", ")}.

CRITICAL RULES:
- Every doorway, passage, and architectural opening must remain OPEN and VISIBLE
- The kitchen area visible through openings must remain unchanged
- Dining table and chairs must stay in their exact positions unless "dining table" is in the change list
- All walls, floor tiles, ceiling, windows stay exactly the same
- Only replace the specific items listed above, nothing else
- Same camera angle and perspective

${productsPrompt}
${renderPromptExtra || ""}

Photorealistic interior photo, same lighting conditions as original.`.trim();

    // Configure FAL client
    fal.config({ credentials: process.env.FAL_KEY });

    // Submit to FAL queue
    let request_id: string;
    try {
      const submission = await fal.queue.submit("fal-ai/flux-pro/kontext", {
        input: {
          prompt: editPrompt,
          image_url: imageUrl,
          num_images: 2,
          guidance_scale: 7,
          output_format: "jpeg",
        },
      });
      request_id = submission.request_id;
      console.log("FAL request submitted:", request_id);
    } catch (falErr) {
      console.error("FAL submit error:", falErr);
      return NextResponse.json({ error: String(falErr) }, { status: 500 });
    }

    return NextResponse.json({ predictionId: request_id, provider: "fal" });
  } catch (err) {
    console.error("Render error:", err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
