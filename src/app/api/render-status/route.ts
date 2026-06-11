import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getStrictFillResult } from "@/lib/falStrictEdit";
import { getStrictJob } from "@/lib/strictJobs";
import { compositeMaskedEdit } from "@/lib/imageComposite";
import { validateStrictRender } from "@/lib/renderValidation";

export const maxDuration = 120;

interface FalKontextOutput {
  images?: { url: string }[];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const predictionId = searchParams.get("id");
    const provider = searchParams.get("provider") || "replicate";

    if (!predictionId) {
      return NextResponse.json({ error: "No prediction ID" }, { status: 400 });
    }

    // Strict object replacement jobs: composite the generated region back
    // onto the original photo before returning anything to the frontend
    if (provider === "fal-fill") {
      const generatedUrl = await getStrictFillResult(predictionId);
      if (!generatedUrl) return NextResponse.json({ status: "processing" });

      const meta = getStrictJob(predictionId);
      if (!meta) {
        // Metadata lost (e.g. server restart) — return raw output with a warning
        // rather than failing. TODO: persist job metadata (see strictJobs.ts).
        console.error("Strict job metadata missing for", predictionId);
        return NextResponse.json({
          status: "succeeded",
          images: [generatedUrl],
          validation: {
            passed: false,
            precisionScore: 0,
            warnings: ["Job metadata was lost — returning uncomposited output"],
          },
        });
      }

      const compositedBuf = await compositeMaskedEdit({
        originalImageUrl: meta.originalImageUrl,
        generatedImageUrl: generatedUrl,
        maskUrl: meta.maskUrl,
      });

      const fileName = `strict-render-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("builtme-uploads")
        .upload(fileName, compositedBuf, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw new Error(`Composited upload failed: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from("builtme-uploads").getPublicUrl(fileName);

      const validation = validateStrictRender({
        maskUrl: meta.maskUrl,
        bbox: meta.bbox,
        finalImageCreated: true,
      });

      return NextResponse.json({
        status: "succeeded",
        images: [urlData.publicUrl],
        validation,
        category: meta.category,
        productName: meta.productName,
      });
    }

    if (provider === "fal") {
      fal.config({ credentials: process.env.FAL_KEY });

      const status = await fal.queue.status("fal-ai/flux-pro/kontext/max", {
        requestId: predictionId,
        logs: false,
      });

      if (status.status === "COMPLETED") {
        const result = await fal.queue.result("fal-ai/flux-pro/kontext/max", {
          requestId: predictionId,
        });

        const images = (result.data as FalKontextOutput)?.images?.map((img) => img.url) || [];
        return NextResponse.json({ status: "succeeded", images });
      } else {
        return NextResponse.json({ status: "processing" });
      }
    }

    // Fallback: existing Replicate logic stays here
    const Replicate = (await import("replicate")).default;
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const prediction = await replicate.predictions.get(predictionId);
    const output = prediction.output;
    const images = Array.isArray(output)
      ? output
      : (output as { images?: string[] })?.images || [];
    return NextResponse.json({
      status: prediction.status === "succeeded" ? "succeeded" :
              prediction.status === "failed" ? "failed" : "processing",
      images,
      error: prediction.error,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Status check failed" }, { status: 500 });
  }
}
