/** Smallest payload the printer accepts; shorter JPEGs are zero-padded. */
export const MIN_JOB_BYTES = 33792;
const MAX_JOB_BYTES = 1048576;

/** JPEG encode at quality q, stepping down by 5 until it fits in 1 MB; pads to MIN_JOB_BYTES. */
export async function encodeJpeg(canvas: OffscreenCanvas, q: number): Promise<{ bytes: Uint8Array; quality: number }> {
  for (;;) {
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q / 100 });
    if (blob.size <= MAX_JOB_BYTES || q - 5 < 10) {
      let bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length < MIN_JOB_BYTES) { const p = new Uint8Array(MIN_JOB_BYTES); p.set(bytes); bytes = p; }
      return { bytes, quality: q };
    }
    q -= 5;
  }
}
