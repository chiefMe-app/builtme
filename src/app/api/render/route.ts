import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const formData = await req.formData();
    const prompt = formData.get("prompt") as string;
    const style = formData.get("style") as string;
    const room = formData.get("room") as string;
    const colorPalette = formData.get("colorPalette") as string;
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

    const renderPrompt = `${room} interior design renovation, ${style} style, ${colorPalette},
    keep exact same room structure walls columns windows doors layout,
    only change materials finishes furniture lighting decor,
    professional architectural visualization, photorealistic, high quality,
    Dubai apartment, ${prompt}`;

    const negativePrompt = `change room structure, move walls, remove windows, remove doors,
    different room layout, different room shape, people, cartoon, sketch,
    unrealistic proportions, blurry, dark, ugly`;

    // Use ControlNet for structure preservation
    const prediction = await replicate.predictions.create({
      version: "854e8727697a057c525cdb45ab037f64ecca770a4e5e7e00c59471a42f35b7cf",
      input: {
        image: imageUrl,
        prompt: renderPrompt,
        negative_prompt: negativePrompt,
        num_outputs: 2,
        num_inference_steps: 30,
        guidance_scale: 8,
        controlnet_conditioning_scale: 0.8,
        strength: 0.7,
        seed: Math.floor(Math.random() * 1000000),
      },
    });

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
