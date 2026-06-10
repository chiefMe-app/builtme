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

    const renderPrompt = `Interior design renovation of this exact room.
    IMPORTANT INSTRUCTIONS: ${prompt}.
    Style: ${style}, Colors: ${colorPalette}, Room: ${room}.
    Keep the exact same room layout, walls, columns, windows, doors.
    Do not add or remove structural elements.
    Only change: materials, finishes, cabinet colors, countertops, backsplash, lighting fixtures, decor.
    Photorealistic, high quality, professional architectural visualization.`;

    const negativePrompt = `change room structure, move walls, remove windows, remove doors,
    different room layout, different room shape, people, cartoon, sketch,
    unrealistic proportions, blurry, dark, ugly`;

    // Use FLUX Depth Pro for structure preservation
    const prediction = await replicate.predictions.create({
      model: "black-forest-labs/flux-depth-pro",
      input: {
        control_image: imageUrl,
        prompt: renderPrompt,
        negative_prompt: negativePrompt,
        num_outputs: 1,
        num_inference_steps: 50,
        guidance_scale: 10,
        prompt_strength: 0.75,
        output_format: "jpg",
        output_quality: 90,
      },
    });

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
