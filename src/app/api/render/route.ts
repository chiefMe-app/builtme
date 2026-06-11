import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Retry on transient 429 (rate limit) responses from Replicate
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const response = (err as { response?: Response }).response;
      if (response?.status === 429 && attempt < retries) {
        let retryAfter = 5;
        try {
          const body = await response.clone().json();
          if (typeof body.retry_after === "number") retryAfter = body.retry_after;
        } catch {
          // ignore, use default retryAfter
        }
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        continue;
      }
      throw err;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const formData = await req.formData();
    const prompt = formData.get("prompt") as string;
    const room = formData.get("room") as string | null;
    const style = formData.get("style") as string | null;
    const colorPalette = formData.get("colorPalette") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!imageFile || imageFile.size === 0) {
      return NextResponse.json({ error: "Please upload a photo of your room" }, { status: 400 });
    }

    // Upload to Supabase Storage
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

    const roomType = room || "living room";
    const changeList = prompt || "furniture, lighting, decor";

    const renderPrompt = `Professional interior design visualization. ${roomType} in a Dubai apartment.
STRICTLY PRESERVE: floor material and pattern, ceiling height and material, all walls, all windows, all doors, room dimensions, fixed appliances positions, structural columns.
ONLY CHANGE: ${changeList}.
Style: ${style || "modern"}.
Colors: ${colorPalette || "neutral warm tones"}.
Ultra photorealistic, architectural visualization, 8K quality, perfect lighting, no distortion.`;

    const prediction = await withRetry(() =>
      replicate.predictions.create({
        model: "black-forest-labs/flux-depth-pro",
        input: {
          control_image: imageUrl,
          prompt: renderPrompt,
          num_outputs: 2,
          num_inference_steps: 28,
          guidance_scale: 15,
          output_format: "jpg",
          output_quality: 95,
          prompt_upsampling: true,
        },
      })
    );

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
