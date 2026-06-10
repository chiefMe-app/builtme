import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "No URL" }, { status: 400 });

    // Download the image from Replicate
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = `render-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("builtme-uploads")
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage
      .from("builtme-uploads")
      .getPublicUrl(fileName);

    return NextResponse.json({ permanentUrl: data.publicUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
