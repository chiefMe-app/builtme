import { fal } from "@fal-ai/client";
import { readFileSync } from "fs";

// Load FAL_KEY from .env.local without printing it
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^FAL_KEY=(.*)$/m)?.[1]?.trim();
if (!key) { console.error("no FAL_KEY found"); process.exit(1); }
fal.config({ credentials: key });

const imageUrl = "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80";

try {
  const result = await fal.subscribe("fal-ai/sam2/image", {
    input: {
      image_url: imageUrl,
      prompts: [{ x: 400, y: 400, label: 1 }],
      output_format: "png",
    },
  });
  console.log("OK:", JSON.stringify(result.data).slice(0, 400));
} catch (err) {
  console.error("status:", err.status);
  console.error("detail:", JSON.stringify(err.body?.detail, null, 2));
}
