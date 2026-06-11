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
    const prompt = formData.get("prompt") as string;
    const productsPrompt = (formData.get("productsPrompt") as string) || "";
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

    // Build precise edit prompt for Kontext
    const itemLabels: Record<string, string> = {
      sofa: "sofa and seating",
      dining: "dining table and chairs",
      lighting: "lighting fixtures",
      wall_colour: "wall paint colour",
      wallpaper: "wallpaper or wall texture",
      rug: "rug",
      curtains: "curtains and blinds",
      coffee_table: "coffee table",
      tv_unit: "TV unit",
      decor: "decor and accessories",
      layout: "furniture layout",
    };

    const selectedItems = whatToChange.filter((id) => itemLabels[id]);
    const changeParts = selectedItems.map((id) => itemLabels[id]);
    if (productsPrompt) changeParts.push(productsPrompt);

    const keepItems = Object.keys(itemLabels).filter((id) => !whatToChange.includes(id));
    const keepList = keepItems.map((id) => itemLabels[id]).join(", ");

    const fullChangeList = whatToChange.includes("existing_only")
      ? "Rearrange the existing furniture into a better layout. Do not add any new items."
      : changeParts.length > 0
        ? `Change: ${changeParts.join(", ")}.`
        : prompt;

    const editPrompt = `Edit this room photo.
${fullChangeList}
DO NOT move or remove: ${keepList}.
Keep identical: floor tiles, ceiling, windows, doors, wall positions, AC units, curtain rails.
Photorealistic result matching the existing room's lighting and perspective.`;

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
