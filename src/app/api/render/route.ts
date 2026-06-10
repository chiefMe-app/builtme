import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

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
      "youzu/stable-interiors-v2",
      {
        input: {
          prompt: renderPrompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1024,
          num_outputs: 2,
          num_inference_steps: 30,
          guidance_scale: 7.5,
        },
      }
    );

    return NextResponse.json({ images: output });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
