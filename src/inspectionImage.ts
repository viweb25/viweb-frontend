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
