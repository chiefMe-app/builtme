import { fal } from "@fal-ai/client";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

interface FalKontextOutput {
  images?: { url: string }[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const predictionId = searchParams.get("id");
    const provider = searchParams.get("provider") || "replicate";

    if (!predictionId) {
      return NextResponse.json({ error: "No prediction ID" }, { status: 400 });
    }

    if (provider === "fal") {
      fal.config({ credentials: process.env.FAL_KEY });

      const status = await fal.queue.status("fal-ai/flux-pro/kontext", {
        requestId: predictionId,
        logs: false,
      });

      if (status.status === "COMPLETED") {
        const result = await fal.queue.result("fal-ai/flux-pro/kontext", {
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
