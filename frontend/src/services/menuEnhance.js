function clamp(value, max) {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

function boxBlur(src, width, height, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) sum += src[row + clamp(i, width - 1)];
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / windowSize;
      sum += src[row + clamp(x + radius + 1, width - 1)] - src[row + clamp(x - radius, width - 1)];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) sum += tmp[clamp(i, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / windowSize;
      sum +=
        tmp[clamp(y + radius + 1, height - 1) * width + x] -
        tmp[clamp(y - radius, height - 1) * width + x];
    }
  }
  return out;
}

export function enhanceMenuScan(imageData) {
  const { width, height, data } = imageData;
  const n = width * height;
  const luma = new Float32Array(n);
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    luma[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    meanR += data[i];
    meanG += data[i + 1];
    meanB += data[i + 2];
  }
  meanR /= n;
  meanG /= n;
  meanB /= n;
  const gray = (meanR + meanG + meanB) / 3;
  const sr = Math.max(0.86, Math.min(1.14, gray / Math.max(meanR, 8)));
  const sg = Math.max(0.86, Math.min(1.14, gray / Math.max(meanG, 8)));
  const sb = Math.max(0.86, Math.min(1.14, gray / Math.max(meanB, 8)));

  const fine = boxBlur(luma, width, height, 1);
  const local = boxBlur(luma, width, height, 4);
  const out = new ImageData(width, height);

  for (let i = 0, p = 0; i < out.data.length; i += 4, p += 1) {
    let r = data[i] * sr;
    let g = data[i + 1] * sg;
    let b = data[i + 2] * sb;
    let y = r * 0.299 + g * 0.587 + b * 0.114;
    y += 0.4 * (luma[p] - fine[p]);
    y += 0.2 * (luma[p] - local[p]);
    y = 128 + (y - 128) * 1.16;
    const scale = luma[p] > 1 ? y / luma[p] : 1;
    out.data[i] = Math.max(0, Math.min(255, r * scale));
    out.data[i + 1] = Math.max(0, Math.min(255, g * scale));
    out.data[i + 2] = Math.max(0, Math.min(255, b * scale));
    out.data[i + 3] = 255;
  }
  return out;
}
