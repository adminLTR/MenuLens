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
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const luma = new Float32Array(n);

  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    r[p] = data[i];
    g[p] = data[i + 1];
    b[p] = data[i + 2];
    luma[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    meanR += r[p];
    meanG += g[p];
    meanB += b[p];
  }
  meanR /= n;
  meanG /= n;
  meanB /= n;
  const gray = (meanR + meanG + meanB) / 3;

  const sr = Math.max(0.94, Math.min(1.06, gray / Math.max(meanR, 8)));
  const sg = Math.max(0.94, Math.min(1.06, gray / Math.max(meanG, 8)));
  const sb = Math.max(0.94, Math.min(1.06, gray / Math.max(meanB, 8)));
  const mix = 0.35;
  for (let i = 0; i < n; i += 1) {
    r[i] = r[i] * (1 - mix + mix * sr);
    g[i] = g[i] * (1 - mix + mix * sg);
    b[i] = b[i] * (1 - mix + mix * sb);
    luma[i] = r[i] * 0.299 + g[i] * 0.587 + b[i] * 0.114;
  }

  const blurred = boxBlur(luma, width, height, 1);
  const out = new ImageData(width, height);
  for (let i = 0, p = 0; i < out.data.length; i += 4, p += 1) {
    const edge = Math.abs(luma[p] - blurred[p]);
    const amount = edge > 22 ? 0.12 : 0.22;
    const nextLuma = luma[p] + amount * (luma[p] - blurred[p]);
    const scale = luma[p] > 1 ? nextLuma / luma[p] : 1;
    const lifted = 0.97 * scale + 0.03;
    out.data[i] = Math.max(0, Math.min(255, data[i] * 0.28 + r[p] * lifted * 0.72));
    out.data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * 0.28 + g[p] * lifted * 0.72));
    out.data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * 0.28 + b[p] * lifted * 0.72));
    out.data[i + 3] = 255;
  }
  return out;
}
