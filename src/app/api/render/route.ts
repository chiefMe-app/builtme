import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  const { prompt, style, room, colorPalette } = await req.json();

  const renderPrompt = `Interior design render, ${room}, ${style} style, ${colorPalette}, ${prompt},
  professional architectural visualization, realistic lighting,
  high quality, 8k, photorealistic, Dubai apartment`;

  const negativePrompt = `people, furniture distortion, unrealistic,
  cartoon, sketch, dark, cluttered`;

  try {
    const output = await replicate.run(
      "stability-ai/stable-diffusion-3.5-large",
      {
        input: {
          prompt: renderPrompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 768,
          num_outputs: 2,
          guidance_scale: 7.5,
          num_inference_steps: 30,
        },
      }
    );

    return NextResponse.json({ images: output });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
