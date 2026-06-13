/**
 * In-memory cache for online product-search results, keyed by the search
 * parameters, to avoid repeated paid API calls. TTL 24h.
 * TODO: persist to a database for cross-instance / cross-restart caching.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;

const globalForCache = globalThis as unknown as { __builtmeProductSearchCache?: Map<string, CacheEntry<unknown>> };
const cache: Map<string, CacheEntry<unknown>> =
  globalForCache.__builtmeProductSearchCache ?? new Map();
globalForCache.__builtmeProductSearchCache = cache;

export function makeCacheKey(parts: {
  category: string;
  supplier?: string;
  styleTags?: string[];
  colorTags?: string[];
  budget?: number;
}): string {
  return [
    parts.category,
    parts.supplier || "",
    (parts.styleTags || []).slice().sort().join(","),
    (parts.colorTags || []).slice().sort().join(","),
    parts.budget ?? "",
  ].join("|");
}

export function getCachedSearch<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedSearch<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}
