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
    const style = formData.get("style") as string;
    const room = formData.get("room") as string;
    const colorPalette = formData.get("colorPalette") as string;
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
    const editPrompt = `Interior design edit of this exact room. ${prompt}.
Style: ${style || "modern contemporary"}.
Colors: ${colorPalette || "warm neutral tones"}.
Room type: ${room || "living room"}.
Keep all walls, windows, doors, floor, ceiling, structural elements exactly the same. Only change the specified furniture and decor items.`;

    // Configure FAL client
    fal.config({ credentials: process.env.FAL_KEY });

    // Submit to FAL queue
    const { request_id } = await fal.queue.submit("fal-ai/flux-kontext-pro", {
      input: {
        prompt: editPrompt,
        image_url: imageUrl,
        num_images: 2,
        guidance_scale: 3.5,
        num_inference_steps: 28,
        output_format: "jpeg",
      },
    });

    return NextResponse.json({ predictionId: request_id, provider: "fal" });
  } catch (err) {
    console.error("Render error:", err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
