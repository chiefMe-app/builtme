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

    const editPrompt = `This is a precise furniture replacement task.

REPLACE these exact items with new versions, keeping them in the SAME position:
${changingItems.join(", ") || "the sofa"}.

${productsPrompt}

ABSOLUTE RULES - violating these ruins the result:
1. Do NOT change the room layout or furniture positions
2. If there is a dining table, it STAYS a dining table in the same spot
3. If there is a sofa, the new sofa goes in the EXACT same position
4. Do NOT close, open, or modify any doorway, window, or wall opening
5. Do NOT change the kitchen or anything visible through doorways
6. Keep floor, ceiling, walls, and all architecture identical
7. Same camera angle, same perspective, same lighting

Only swap the furniture STYLE, never the furniture TYPE or POSITION.
${renderPromptExtra || ""}`.trim();

    // Configure FAL client
    fal.config({ credentials: process.env.FAL_KEY });

    // Submit to FAL queue
    let request_id: string;
    try {
      const submission = await fal.queue.submit("fal-ai/flux-pro/kontext/max", {
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
