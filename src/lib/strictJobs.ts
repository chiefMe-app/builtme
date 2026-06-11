/**
 * Job metadata for strict-replacement renders, keyed by FAL request id.
 * render/route.ts writes it on submit; render-status/route.ts reads it to
 * composite the result back onto the original photo.
 *
 * TODO (production): persist this in Supabase (e.g. a builtme_render_jobs table)
 * — an in-memory map is lost on server restart and not shared across instances.
 */

export interface StrictJobMetadata {
  originalImageUrl: string;
  maskUrl: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  category: string | null;
  productName: string | null;
  createdAt: number;
}

const globalForJobs = globalThis as unknown as { __builtmeStrictJobs?: Map<string, StrictJobMetadata> };

const jobs: Map<string, StrictJobMetadata> =
  globalForJobs.__builtmeStrictJobs ?? new Map<string, StrictJobMetadata>();
globalForJobs.__builtmeStrictJobs = jobs;

export function setStrictJob(requestId: string, meta: StrictJobMetadata) {
  // Drop entries older than 1 hour so the map can't grow unbounded
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, m] of jobs) {
    if (m.createdAt < cutoff) jobs.delete(id);
  }
  jobs.set(requestId, meta);
}

export function getStrictJob(requestId: string): StrictJobMetadata | undefined {
  return jobs.get(requestId);
}
