import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  useFileOutput: false,
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

    // Try a mask covering only the elements to redesign (cabinets, countertops,
    // backsplash, lighting). Floor, ceiling, walls, windows and doors stay outside the mask.
    let maskUrl: string | null = null;
    try {
      const maskOutput = await replicate.run(
        "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
        {
          input: {
            image: imageUrl,
            mask_prompt: "cabinets, countertop, backsplash, kitchen island, shelves, lighting fixtures",
            negative_mask_prompt: "floor, ceiling, walls, window, door",
            adjustment_factor: 0,
          },
        }
      );
      maskUrl = (Array.isArray(maskOutput) ? maskOutput[0] : maskOutput) as string;
    } catch (maskErr) {
      console.error("Mask generation failed, falling back to depth-based render:", maskErr);
    }

    let prediction;
    if (maskUrl) {
      const renderPrompt = `Photorealistic interior design renovation.
      Redesign the cabinets, countertop, backsplash tiles, and lighting fixtures.
      Style direction: ${style}. Colors: ${colorPalette}. ${prompt}.
      Seamlessly blend with the existing floor, ceiling, walls and room layout.
      High quality, professional architectural visualization, Dubai apartment.`;

      // Use FLUX Fill Pro to inpaint only the masked area
      prediction = await replicate.predictions.create({
        model: "black-forest-labs/flux-fill-pro",
        input: {
          image: imageUrl,
          mask: maskUrl,
          prompt: renderPrompt,
          steps: 50,
          guidance: 60,
          output_format: "jpg",
        },
      });
    } else {
      const renderPrompt = `Interior design renovation of this exact room.
      CRITICAL - DO NOT CHANGE: the floor tiles/flooring material, the ceiling height and ceiling material, suspended ceiling tiles if present, room dimensions, walls position, windows position, doors position.
      CHANGE ONLY: cabinet colors and style, countertop material, backsplash tiles, lighting fixtures, decorative items, plants.
      Style direction: ${style}. Colors: ${colorPalette}. ${prompt}.
      Photorealistic, high quality, professional architectural visualization, Dubai apartment.`;

      const negativePrompt = `change room structure, move walls, remove windows, remove doors,
      different room layout, different room shape, different floor tiles, changed flooring,
      new floor pattern, different floor color, replaced floor, different ceiling,
      people, cartoon, sketch, unrealistic proportions, blurry, dark, ugly`;

      // Fall back to FLUX Depth Pro for structure preservation
      prediction = await replicate.predictions.create({
        model: "black-forest-labs/flux-depth-pro",
        input: {
          control_image: imageUrl,
          prompt: renderPrompt,
          negative_prompt: negativePrompt,
          num_outputs: 1,
          num_inference_steps: 50,
          guidance_scale: 10,
          prompt_strength: 0.55,
          output_format: "jpg",
          output_quality: 90,
        },
      });
    }

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
