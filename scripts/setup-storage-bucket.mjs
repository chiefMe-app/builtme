// One-off script to create the "builtme-uploads" Supabase Storage bucket.
//
// Usage:
//   1. Add SUPABASE_SERVICE_ROLE_KEY=your_service_role_key to .env.local
//      (find it in Supabase dashboard -> Project Settings -> API -> service_role key)
//   2. Run: node scripts/setup-storage-bucket.mjs
//
// The service role key is only needed for this one-time setup and is never
// used by the app at runtime.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && !process.env[key]) {
      process.env[key] = rest.join("=").trim();
    }
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "builtme-uploads";

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error("Failed to list buckets:", listError.message);
  process.exit(1);
}

if (buckets.some((bucket) => bucket.name === BUCKET_NAME)) {
  console.log(`Bucket "${BUCKET_NAME}" already exists.`);
  process.exit(0);
}

const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
  public: false,
  fileSizeLimit: "10MB",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
});

if (createError) {
  console.error("Failed to create bucket:", createError.message);
  process.exit(1);
}

console.log(`Bucket "${BUCKET_NAME}" created successfully.`);
