import { fal } from "@fal-ai/client";

/**
 * All provider-specific fal.ai calls for Strict Object Replacement mode live here
 * so the exact models can be swapped without touching app flow.
 *
 * Current model choices:
 * - Segmentation: "fal-ai/sam2/image" (SAM 2, point-prompted, returns a mask image)
 *   TODO: evaluate "fal-ai/sam-3/image" for better category-aware segmentation.
 * - Mask inpainting: "fal-ai/flux-pro/v1/fill" (FLUX Pro Fill — official mask inpainting)
 *   TODO: re-evaluate when FLUX Kontext gains first-class mask input support.
 */
const SEGMENT_MODEL = "fal-ai/sam2/image";
const STRICT_FILL_MODEL = "fal-ai/flux-pro/v1/fill";

function configureFal() {
  fal.config({ credentials: process.env.FAL_KEY });
}

/** Segment the object at a pixel coordinate. Returns the raw mask image URL. */
export async function segmentObjectAtPoint(params: {
  imageUrl: string;
  x: number;
  y: number;
}): Promise<string> {
  configureFal();
  const result = await fal.subscribe(SEGMENT_MODEL, {
    input: {
      image_url: params.imageUrl,
      prompts: [{ x: Math.round(params.x), y: Math.round(params.y), label: "1" as const }],
      output_format: "png" as const,
    },
  });
  const maskUrl = result.data?.image?.url;
  if (!maskUrl) throw new Error("Segmentation returned no mask");
  return maskUrl;
}

/** Submit a strict mask-only inpainting job. Returns the queue request id. */
export async function submitStrictFill(params: {
  imageUrl: string;
  maskUrl: string;
  prompt: string;
}): Promise<string> {
  configureFal();
  const submission = await fal.queue.submit(STRICT_FILL_MODEL, {
    input: {
      image_url: params.imageUrl,
      mask_url: params.maskUrl,
      prompt: params.prompt,
      num_images: 1,
      output_format: "jpeg",
    },
  });
  return submission.request_id;
}

/** Poll a strict fill job. Returns the generated image URL when complete, null while processing. */
export async function getStrictFillResult(requestId: string): Promise<string | null> {
  configureFal();
  const status = await fal.queue.status(STRICT_FILL_MODEL, {
    requestId,
    logs: false,
  });
  if (status.status !== "COMPLETED") return null;

  const result = await fal.queue.result(STRICT_FILL_MODEL, { requestId });
  const images = (result.data as { images?: { url: string }[] })?.images;
  const url = images?.[0]?.url;
  if (!url) throw new Error("Strict fill returned no image");
  return url;
}
