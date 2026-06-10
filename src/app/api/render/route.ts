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

    const renderPrompt = `Modern Boho interior design kitchen renovation.
    White or cream shaker cabinets, marble or quartz white countertop,
    neutral backsplash tiles, warm wood accents, rattan pendant light,
    indoor plants, clean and bright atmosphere.
    Keep same room layout, same wall positions, same window, same appliances positions.
    ${prompt}.
    Photorealistic, high quality, bright natural light, Dubai apartment.`;

    const negativePrompt = `change room structure, move walls, remove windows, remove doors,
    different room layout, different room shape, different floor tiles, changed flooring,
    new floor pattern, different floor color, replaced floor, different ceiling,
    people, cartoon, sketch, unrealistic proportions, blurry, dark, ugly`;

    const prediction = await withRetry(() =>
      replicate.predictions.create({
        version: "4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf",
        input: {
          image: imageUrl,
          prompt: renderPrompt,
          negative_prompt: negativePrompt,
          num_outputs: 1,
          num_inference_steps: 40,
          guidance_scale: 10,
          strength: 0.70,
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
