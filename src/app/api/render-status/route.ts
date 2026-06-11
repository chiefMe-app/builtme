import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "No prediction ID" }, { status: 400 });
  }

  try {
    const prediction = await replicate.predictions.get(id);
    console.log("Prediction status:", prediction.status);
    console.log("Prediction output:", JSON.stringify(prediction.output));

    const output = prediction.output;
    let images: string[] = [];
    if (Array.isArray(output)) {
      images = output;
    } else if (typeof output === "string") {
      images = [output];
    } else if (output && typeof output === "object") {
      images = (output as { images?: string[] }).images || (Object.values(output) as string[]);
    }

    return NextResponse.json({
      status: prediction.status,
      images,
      error: prediction.error,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
