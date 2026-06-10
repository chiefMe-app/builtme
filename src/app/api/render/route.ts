import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const prompt = formData.get("prompt") as string;
    const style = formData.get("style") as string;
    const room = formData.get("room") as string;
    const colorPalette = formData.get("colorPalette") as string;
    const imageFile = formData.get("image") as File | null;

    const renderPrompt = `${room} interior design, ${style} style, ${colorPalette}, professional architectural visualization, realistic lighting, high quality, photorealistic, Dubai apartment, ${prompt}`;
    const negativePrompt = `people, furniture distortion, unrealistic, cartoon, sketch, dark, cluttered, ugly, deformed`;

    let imageUrl: string | undefined;

    if (imageFile && imageFile.size > 0) {
      const arrayBuffer = await imageFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = imageFile.type || "image/jpeg";
      imageUrl = `data:${mimeType};base64,${base64}`;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Please upload a photo of your room to generate renders" },
        { status: 400 }
      );
    }

    const output = await replicate.run(
      "youzu/stable-interiors-v2:4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf",
      {
        input: {
          image: imageUrl,
          prompt: renderPrompt,
          negative_prompt: negativePrompt,
          num_outputs: 2,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          strength: 0.8,
        },
      }
    );

    return NextResponse.json({ images: output });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
