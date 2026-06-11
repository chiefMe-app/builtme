import sharp from "sharp";

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Final image = original outside the mask + generated inside the mask.
 * Even if the model repainted the whole frame, every pixel outside the mask
 * comes from the original photo. Mask edges are feathered for a natural blend.
 *
 * Returns a JPEG buffer (caller uploads it to storage).
 */
export async function compositeMaskedEdit(params: {
  originalImageUrl: string;
  generatedImageUrl: string;
  maskUrl: string;
}): Promise<Buffer> {
  const [originalBuf, generatedBuf, maskBuf] = await Promise.all([
    fetchBuffer(params.originalImageUrl),
    fetchBuffer(params.generatedImageUrl),
    fetchBuffer(params.maskUrl),
  ]);

  const meta = await sharp(originalBuf).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error("Could not read original image dimensions");

  // Resize generated image and mask to the original's dimensions
  const generatedResized = await sharp(generatedBuf)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .toBuffer();

  // Feather the mask edges with a slight blur so the edit blends naturally
  const featheredMask = await sharp(maskBuf)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .blur(2)
    .png()
    .toBuffer();

  // Use the feathered mask as the generated image's alpha channel,
  // then lay it over the original: outside-mask pixels stay original.
  const generatedWithAlpha = await sharp(generatedResized)
    .joinChannel(featheredMask)
    .png()
    .toBuffer();

  return sharp(originalBuf)
    .composite([{ input: generatedWithAlpha }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
