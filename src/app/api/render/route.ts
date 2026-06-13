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
${wallCategoryInstruction(category)}${extra ? `\nAdditional instruction: ${extra}` : ""}
`.trim();
}

// Category-specific guardrails so wall-mounted objects stay on the wall and are
// never swapped for plants/vases/tabletop/floor decor.
function wallCategoryInstruction(category: string | null): string {
  const c = (category || "").toLowerCase();
  if (c === "mirror") {
    return "\nReplace only the selected wall mirror. Keep it mounted on the same wall area, same approximate size and position.\n";
  }
  if (c === "wall_decor" || c === "wall_art" || c === "wall_panel" || c === "wall_sculpture") {
    return "\nReplace only the selected wall-mounted decor. Keep it attached to the same wall area, same approximate height, size, and position. Do not replace it with a plant, vase, table object, cushion, or floor decor.\n";
  }
  return "";
}

// Restyle mode prompt: guided whole-room restyle with category-locked product
// placement. Distinct from the strict mask prompt — never mix the two.
// NOTE: FLUX Kontext has no negative_prompt input, so all negative constraints
// (no oversized consoles, no type conversion, etc.) live inside this prompt.
function buildRestylePrompt({
  productsPrompt,
  renderPromptExtra,
}: {
  productsPrompt: string;
  renderPromptExtra?: string;
}) {
  return `
This is a GUIDED ROOM RESTYLE task.

Restyle the room using the selected product categories below, while preserving the original room layout.

SELECTED PRODUCT MAPPINGS:
${productsPrompt || "No specific products selected. Use the overall style direction only."}

ABSOLUTE RULES:

1. Preserve the same room structure, walls, windows, doors, balcony, ceiling, floor, camera angle, perspective, crop, and composition.
2. Keep the room layout the same.
3. Apply each selected product only to a matching existing object type in the room.
4. Do not move products between zones.
5. Keep dining items in the dining area.
6. Keep living room items in the living area.
7. Keep TV unit / console items only on an existing TV wall or existing console area.
8. If a dining table product is selected, apply it only to the existing dining table. It must remain a dining table.
9. If chair products are selected, apply them only to existing chairs.
10. If sofa products are selected, apply them only to the existing sofa.
11. If coffee table products are selected, apply them only to the existing coffee table, not the dining table.
12. If lighting products are selected, apply them only to existing light fixture positions.
13. If rug products are selected, apply them only to the rug/floor textile area.
14. If decor products are selected, apply them subtly to existing decor areas or wall styling.
15. Do not create a huge TV console, sideboard, cabinet, or wall unit unless that exact category is selected and an existing matching object is visible.
16. Do not convert one furniture type into another.
17. Do not replace a dining table with a TV console.
18. Do not replace chairs with cabinets.
19. Do not add oversized furniture.
20. Keep replacement/restyled furniture within roughly the same footprint and scale as the existing matching object.
21. If a selected product category has no clearly matching object in the room, skip it or use it only as subtle material/style inspiration.
22. The result must look like the same room, improved, not a different room.

SCALE RULE:
Furniture must remain realistically sized. Do not generate furniture larger than the object it is replacing. Keep approximate scale between 0.8x and 1.2x of the existing matching object.

${renderPromptExtra || ""}
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

      console.log("[strict-render]", {
        selectedObjectCategory: body.selectedObjectCategory,
        selectedObjectBbox: body.selectedObjectBbox,
        hasMask: Boolean(body.selectedObjectMaskUrl),
        strictMode: body.strictMode,
      });

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
        await setStrictJob(request_id, {
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

    // Restyle mode (form data)
    const formData = await req.formData();
    const rawPrompt = formData.get("prompt") as string | null;
    const productsPrompt = formData.get("productsPrompt") as string | null;
    const renderPromptExtra = (formData.get("renderPromptExtra") as string) || "";
    const inputImageUrl = formData.get("imageUrl") as string | null;
    const imageFile = formData.get("image") as File | null;

    // Structured category-mapped restyle prompt takes priority; a raw prompt
    // (e.g. legacy chained-edit step) is still accepted as a fallback
    const prompt = productsPrompt !== null
      ? buildRestylePrompt({ productsPrompt, renderPromptExtra })
      : rawPrompt;

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
