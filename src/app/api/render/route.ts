import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { submitStrictFill } from "@/lib/falStrictEdit";
import { setStrictJob } from "@/lib/strictJobs";

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StrictRenderRequest {
  strictMode: boolean;
  imageUrl: string;
  selectedObjectMaskUrl: string;
  selectedObjectBbox: { x: number; y: number; width: number; height: number } | null;
  selectedObjectCategory: string | null;
  replacementRenderDescription: string;
  replacementProductName?: string;
  renderPromptExtra?: string;
}

function buildStrictEditPrompt(category: string | null, replacementRenderDescription: string, extra?: string) {
  return `
This is a STRICT LOCAL OBJECT REPLACEMENT task.

Replace ONLY the selected masked object.

Selected object category:
${category || "unknown"}

Replacement item:
${replacementRenderDescription}

ABSOLUTE RULES:

1. Edit ONLY the masked object area.
2. Keep every pixel outside the mask unchanged.
3. Do NOT redesign the room.
4. Do NOT move any furniture.
5. Do NOT change the camera angle, lens, perspective, crop, or composition.
6. Do NOT change walls, ceiling, floor tiles, rug, windows, doors, balcony, kitchen, AC vents, wall art, TV unit, dining table, plants, lamps, or any unselected object.
7. The replacement must occupy the same footprint as the original object.
8. Keep the same orientation, scale, and floor contact points.
9. If replacing a sofa, the new sofa must stay exactly where the old sofa was.
10. If replacing a coffee table, the new coffee table must stay exactly where the old coffee table was.
11. If replacing lighting, the new light must attach to the exact same ceiling point.
12. If replacing a dining chair, keep the dining table and all chair positions unchanged.
13. Keep natural lighting and shadows consistent with the original photo.
14. Do not add extra objects.
15. Do not remove unrelated objects.
16. Do not change the furniture type unless the selected replacement category explicitly requires it.

The result should look like the same room photo with only the selected object replaced.
${extra ? `\nAdditional instruction: ${extra}` : ""}
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    // Strict object replacement mode (JSON body)
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json()) as StrictRenderRequest;

      if (!body.strictMode) {
        return NextResponse.json({ error: "JSON body is only supported for strict mode" }, { status: 400 });
      }
      if (!body.imageUrl || !body.selectedObjectMaskUrl || !body.replacementRenderDescription) {
        return NextResponse.json(
          { error: "Please select the object you want to replace and choose one replacement product." },
          { status: 400 }
        );
      }

      const strictPrompt = buildStrictEditPrompt(
        body.selectedObjectCategory,
        body.replacementRenderDescription,
        body.renderPromptExtra
      );

      try {
        const request_id = await submitStrictFill({
          imageUrl: body.imageUrl,
          maskUrl: body.selectedObjectMaskUrl,
          prompt: strictPrompt,
        });
        setStrictJob(request_id, {
          originalImageUrl: body.imageUrl,
          maskUrl: body.selectedObjectMaskUrl,
          bbox: body.selectedObjectBbox,
          category: body.selectedObjectCategory,
          productName: body.replacementProductName || null,
          createdAt: Date.now(),
        });
        console.log("Strict fill submitted:", request_id);
        return NextResponse.json({ predictionId: request_id, provider: "fal-fill" });
      } catch (falErr) {
        console.error("Strict fill submit error:", falErr);
        return NextResponse.json({ error: String(falErr) }, { status: 500 });
      }
    }

    // Restyle mode (existing flow, form data)
    const formData = await req.formData();
    const prompt = formData.get("prompt") as string;
    const inputImageUrl = formData.get("imageUrl") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!prompt) {
      return NextResponse.json({ error: "No edit instruction provided" }, { status: 400 });
    }

    let imageUrl = inputImageUrl;

    // No previous render URL — upload the room photo to Supabase Storage
    if (!imageUrl) {
      if (!imageFile || imageFile.size === 0) {
        return NextResponse.json({ error: "Please upload a photo of your room" }, { status: 400 });
      }

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

      imageUrl = urlData.publicUrl;
    }

    // Configure FAL client
    fal.config({ credentials: process.env.FAL_KEY });

    // Submit one surgical edit to FAL queue.
    // Kontext works best with a single short edit instruction at default guidance —
    // multi-item edits are chained client-side, one call per item.
    let request_id: string;
    try {
      const submission = await fal.queue.submit("fal-ai/flux-pro/kontext/max", {
        input: {
          prompt,
          image_url: imageUrl,
          num_images: 1,
          guidance_scale: 3.5,
          output_format: "jpeg",
        },
      });
      request_id = submission.request_id;
      console.log("FAL request submitted:", request_id);
    } catch (falErr) {
      console.error("FAL submit error:", falErr);
      return NextResponse.json({ error: String(falErr) }, { status: 500 });
    }

    return NextResponse.json({ predictionId: request_id, provider: "fal" });
  } catch (err) {
    console.error("Render error:", err);
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
