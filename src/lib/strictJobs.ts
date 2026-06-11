import { createClient } from "@supabase/supabase-js";

/**
 * Job metadata for strict-replacement renders, keyed by FAL request id.
 * render/route.ts writes it on submit; render-status/route.ts reads it to
 * composite the result back onto the original photo.
 *
 * Persisted as small JSON files in Supabase Storage so it survives server
 * restarts and works when submit/status run in different workers or lambdas.
 * An in-memory map fronts it as a fast same-process cache.
 */

export interface StrictJobMetadata {
  originalImageUrl: string;
  maskUrl: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  category: string | null;
  productName: string | null;
  createdAt: number;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "builtme-uploads";
const jobPath = (requestId: string) => `strict-jobs/${requestId}.json`;

const globalForJobs = globalThis as unknown as { __builtmeStrictJobs?: Map<string, StrictJobMetadata> };
const cache: Map<string, StrictJobMetadata> =
  globalForJobs.__builtmeStrictJobs ?? new Map<string, StrictJobMetadata>();
globalForJobs.__builtmeStrictJobs = cache;

export async function setStrictJob(requestId: string, meta: StrictJobMetadata): Promise<void> {
  cache.set(requestId, meta);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(jobPath(requestId), Buffer.from(JSON.stringify(meta)), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    // Cache still covers the common same-process case; log loudly so we notice
    console.error("Failed to persist strict job metadata:", error.message);
  }
}

export async function getStrictJob(requestId: string): Promise<StrictJobMetadata | undefined> {
  const cached = cache.get(requestId);
  if (cached) return cached;

  const { data, error } = await supabase.storage.from(BUCKET).download(jobPath(requestId));
  if (error || !data) return undefined;

  try {
    const meta = JSON.parse(await data.text()) as StrictJobMetadata;
    cache.set(requestId, meta);
    return meta;
  } catch {
    return undefined;
  }
}
