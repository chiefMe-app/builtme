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
    return NextResponse.json({
      status: prediction.status,
      images: prediction.output || [],
      error: prediction.error,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
