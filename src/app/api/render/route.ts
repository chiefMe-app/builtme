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

    // Generate a mask covering only the elements to redesign (cabinets, countertops,
    // backsplash, lighting). Floor, ceiling, walls, windows and doors stay outside the mask.
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
    const maskUrl = (Array.isArray(maskOutput) ? maskOutput[0] : maskOutput) as string;

    const renderPrompt = `Photorealistic interior design renovation.
    Redesign the cabinets, countertop, backsplash tiles, and lighting fixtures.
    Style direction: ${style}. Colors: ${colorPalette}. ${prompt}.
    Seamlessly blend with the existing floor, ceiling, walls and room layout.
    High quality, professional architectural visualization, Dubai apartment.`;

    // Use FLUX Fill Pro to inpaint only the masked area
    const prediction = await replicate.predictions.create({
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

    return NextResponse.json({ predictionId: prediction.id });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
