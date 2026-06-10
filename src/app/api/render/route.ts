import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const renderPrompt = `${room} interior design, ${style} style, ${colorPalette}, professional architectural visualization, realistic lighting, high quality, photorealistic, Dubai apartment, ${prompt}`;
    const negativePrompt = `people, furniture distortion, unrealistic, cartoon, sketch, dark, cluttered, ugly, deformed`;

    if (!imageFile || imageFile.size === 0) {
      return NextResponse.json({ error: "Please upload a photo of your room" }, { status: 400 });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `render-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("builtme-uploads")
      .upload(fileName, buffer, {
        contentType: imageFile.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase upload error:", JSON.stringify(uploadError));
      return NextResponse.json({ error: `Image upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("builtme-uploads")
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    const prediction = await replicate.predictions.create({
      version: "4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf",
      input: {
        image: imageUrl,
        prompt: renderPrompt,
        negative_prompt: negativePrompt,
        num_outputs: 2,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        strength: 0.8,
      },
    });

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
