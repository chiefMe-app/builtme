/**
 * Product image/link validation.
 *
 * The LLM is told to only return image/product URLs it is confident about, but
 * we never trust that alone: a URL is only shown if its host is on the trusted
 * shopping/CDN allowlist below. Anything else falls back to a safe local
 * category image.
 */

const TRUSTED_PRODUCT_DOMAINS = [
  "ikea.com",
  "ikea.ae",
  "amazon.ae",
  "media-amazon.com",
  "noon.com",
  "z.nooncdn.com",
  "nooncdn.com",
  "homecentre.com",
  "landmarkshops.com",
  "2xlhome.com",
  "panemirates.com",
  "danubehome.com",
  "westelm.ae",
  "potterybarn.ae",
  "theone.com",
  "homesrus.ae",
];

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"];

function isTrustedHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return TRUSTED_PRODUCT_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

export function isValidProductImageUrl({
  imageUrl,
}: {
  imageUrl?: string;
  productName: string;
  category: string;
  brand?: string;
}): boolean {
  if (!imageUrl || !imageUrl.startsWith("https://")) return false;
  if (!isTrustedHost(imageUrl)) return false;

  // Likely a product image: direct image file, or a known image CDN path
  const path = (() => {
    try {
      return new URL(imageUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const hasImageExtension = IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
  const isCdnImagePath = /\/(images?|media|photos?|p|assets)\//.test(path);
  return hasImageExtension || isCdnImagePath;
}

/** Product page links: must be https on a trusted supplier domain. */
export function isValidProductUrl(productUrl?: string): boolean {
  if (!productUrl || !productUrl.startsWith("https://")) return false;
  return isTrustedHost(productUrl);
}
