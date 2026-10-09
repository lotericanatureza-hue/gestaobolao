export interface PreprocessedImages {
  grayscale: File;
  binarized: File;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], name, { type: 'image/png' }));
      else reject(new Error('Failed to create blob from canvas'));
    }, 'image/png');
  });
}

function otsuThreshold(data: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = pixelCount - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) ** 2;
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * Pre-process a receipt photo for OCR:
 * 1. Upscale 2.5x (capped so neither dimension exceeds 4000px)
 * 2. Convert to grayscale (luminosity method)
 * 3. Histogram-stretch contrast
 * 4. Produce two versions — grayscale+contrast and Otsu-binarized — so the
 *    caller can run OCR on both and keep whichever extracts more items.
 */
export async function preprocessImage(file: File): Promise<PreprocessedImages> {
  const img = await loadImageFromFile(file);
  const maxDim = 4000;
  const scale = Math.min(2.5, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const val = Math.round(((data[i] - min) / range) * 255);
    data[i] = data[i + 1] = data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  const grayscaleFile = await canvasToFile(canvas, 'preprocessed-gray.png');

  const threshold = otsuThreshold(data);
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
  const binarizedFile = await canvasToFile(canvas, 'preprocessed-binary.png');

  return { grayscale: grayscaleFile, binarized: binarizedFile };
}
