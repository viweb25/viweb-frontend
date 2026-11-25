export async function makeJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image capture is unavailable.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(image => image ? resolve(image) : reject(new Error('Could not encode image.')), 'image/jpeg', 0.9);
  });
}

export function looksBlurry(image: ImageBitmap) {
  const scale = 192 / Math.max(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(3, Math.round(image.width * scale));
  canvas.height = Math.max(3, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const light = (index: number) => .299 * pixels[index * 4] + .587 * pixels[index * 4 + 1] + .114 * pixels[index * 4 + 2];
  let sum = 0;
  let squared = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const edge = 4 * light(i) - light(i - 1) - light(i + 1) - light(i - width) - light(i + width);
      sum += edge;
      squared += edge * edge;
    }
  }
  const samples = (width - 2) * (height - 2);
  return squared / samples - (sum / samples) ** 2 < 35;
}
