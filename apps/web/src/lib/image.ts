export const DEFAULT_AVATAR = '/images/default-avatar.svg';

const AVATAR_SIZE = 128;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Center-crops to a square, scales to 128x128 and encodes as a small WebP. */
export async function compressAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > MAX_INPUT_BYTES) {
    throw new Error('Invalid image');
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.5),
  );
  if (!blob || blob.type !== 'image/webp') throw new Error('WebP encoding unsupported');
  return blob;
}
