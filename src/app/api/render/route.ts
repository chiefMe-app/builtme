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
    const inputImageUrl = formData.get("imageUrl") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!prompt) {
      return NextResponse.json({ error: "No edit instruction provided" }, { status: 400 });
    }

    let imageUrl = inputImageUrl;

    // No previous render URL — upload the room photo to Supabase Storage
    if (!imageUrl) {
      if (!imageFile || imageFile.size === 0) {
        return NextResponse.json({ error: "Please upload a photo of your room" }, { status: 400 });
      }

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

      imageUrl = urlData.publicUrl;
    }

    // Configure FAL client
    fal.config({ credentials: process.env.FAL_KEY });

    // Submit one surgical edit to FAL queue.
    // Kontext works best with a single short edit instruction at default guidance —
    // multi-item edits are chained client-side, one call per item.
    let request_id: string;
    try {
      const submission = await fal.queue.submit("fal-ai/flux-pro/kontext/max", {
        input: {
          prompt,
          image_url: imageUrl,
          num_images: 1,
          guidance_scale: 3.5,
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
