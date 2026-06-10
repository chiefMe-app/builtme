import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const formData = await req.formData();
    const imageFile = formData.get("image") as File;
    if (!imageFile) return NextResponse.json({ error: "No image" }, { status: 400 });

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `before-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("builtme-uploads")
      .upload(fileName, buffer, {
        contentType: imageFile.type || "image/jpeg",
        upsert: true,
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabase.storage.from("builtme-uploads").getPublicUrl(fileName);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
