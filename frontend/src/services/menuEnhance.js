function clamp(value, max) {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

function clamp255(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function srgbToLinear(value) {
  const x = value / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const x = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055;
  return clamp255(x * 255);
}

function fLab(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function fLabInv(t) {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

function rgbToLab8(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = (0.412453 * rl + 0.35758 * gl + 0.180423 * bl) / 0.950456;
  const y = 0.212671 * rl + 0.71516 * gl + 0.072169 * bl;
  const z = (0.019334 * rl + 0.119193 * gl + 0.950227 * bl) / 1.088754;
  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);
  return [
    clamp255(((116 * fy - 16) * 255) / 100),
    clamp255(500 * (fx - fy) + 128),
    clamp255(200 * (fy - fz) + 128),
  ];
}

function lab8ToRgb(l, a, b) {
  const fy = (l * 100) / 255 / 116 + 16 / 116;
  const fx = fy + (a - 128) / 500;
  const fz = fy - (b - 128) / 200;
  const x = fLabInv(fx) * 0.950456;
  const y = fLabInv(fy);
  const z = fLabInv(fz) * 1.088754;
  const r = 3.240479 * x - 1.53715 * y - 0.498535 * z;
  const g = -0.969256 * x + 1.875991 * y + 0.041556 * z;
  const bLin = 0.055648 * x - 0.204043 * y + 1.057311 * z;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bLin)];
}

function tileLut(luma, width, x0, y0, x1, y1, clipLimit) {
  const hist = new Float64Array(256);
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      hist[luma[row + x] | 0] += 1;
      count += 1;
    }
  }
  const lut = new Float32Array(256);
  if (!count) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  const clip = Math.max(1, (clipLimit * count) / 256);
  let excess = 0;
  for (let i = 0; i < 256; i += 1) {
    if (hist[i] > clip) {
      excess += hist[i] - clip;
      hist[i] = clip;
    }
  }
  const redist = excess / 256;
  let cdf = 0;
  for (let i = 0; i < 256; i += 1) {
    hist[i] += redist;
    cdf += hist[i];
    lut[i] = (cdf / count) * 255;
  }
  return lut;
}

function claheChannel(channel, width, height, tiles = 8, clipLimit = 2.1) {
  const luts = [];
  const tileW = width / tiles;
  const tileH = height / tiles;
  for (let ty = 0; ty < tiles; ty += 1) {
    const row = [];
    for (let tx = 0; tx < tiles; tx += 1) {
      const x0 = Math.floor(tx * tileW);
      const y0 = Math.floor(ty * tileH);
      const x1 = tx === tiles - 1 ? width : Math.floor((tx + 1) * tileW);
      const y1 = ty === tiles - 1 ? height : Math.floor((ty + 1) * tileH);
      row.push(tileLut(channel, width, x0, y0, x1, y1, clipLimit));
    }
    luts.push(row);
  }

  const out = new Uint8ClampedArray(channel.length);
  const last = tiles - 1;
  for (let y = 0; y < height; y += 1) {
    const gy = (y + 0.5) / tileH - 0.5;
    const y0 = Math.max(0, Math.min(last, Math.floor(gy)));
    const y1 = Math.max(0, Math.min(last, y0 + 1));
    const dy = y0 === y1 ? 0 : gy - y0;
    for (let x = 0; x < width; x += 1) {
      const gx = (x + 0.5) / tileW - 0.5;
      const x0 = Math.max(0, Math.min(last, Math.floor(gx)));
      const x1 = Math.max(0, Math.min(last, x0 + 1));
      const dx = x0 === x1 ? 0 : gx - x0;
      const v = channel[y * width + x] | 0;
      const a = luts[y0][x0][v];
      const b = luts[y0][x1][v];
      const c = luts[y1][x0][v];
      const d = luts[y1][x1][v];
      out[y * width + x] = clamp255(
        (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy,
      );
    }
  }
  return out;
}

function gaussianKernel(sigma) {
  const ksize = Math.round(sigma * 6 + 1) | 1;
  const radius = (ksize - 1) >> 1;
  const kernel = new Float32Array(ksize);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / denom);
    kernel[i + radius] = weight;
    sum += weight;
  }
  for (let i = 0; i < ksize; i += 1) kernel[i] /= sum;
  return { kernel, radius };
}

function blurChannel(src, width, height, kernel, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const ksize = kernel.length;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let i = 0; i < ksize; i += 1) {
        sum += src[row + clamp(x + i - radius, width - 1)] * kernel[i];
      }
      tmp[row + x] = sum;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let i = 0; i < ksize; i += 1) {
        sum += tmp[clamp(y + i - radius, height - 1) * width + x] * kernel[i];
      }
      out[y * width + x] = sum;
    }
  }
  return out;
}

function bilateralRgb(r, g, b, width, height, diameter, sigmaColor, sigmaSpace) {
  const radius = (diameter - 1) >> 1;
  const colorCoeff = -0.5 / (sigmaColor * sigmaColor);
  const spaceCoeff = -0.5 / (sigmaSpace * sigmaSpace);
  const spaceW = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      spaceW.push(Math.exp((dx * dx + dy * dy) * spaceCoeff));
    }
  }

  const outR = new Uint8ClampedArray(r.length);
  const outG = new Uint8ClampedArray(g.length);
  const outB = new Uint8ClampedArray(b.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const cr = r[i];
      const cg = g[i];
      const cb = b[i];
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wsum = 0;
      let k = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = clamp(y + dy, height - 1);
        const row = yy * width;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = clamp(x + dx, width - 1);
          const j = row + xx;
          const dr = cr - r[j];
          const dg = cg - g[j];
          const db = cb - b[j];
          const weight = spaceW[k] * Math.exp((dr * dr + dg * dg + db * db) * colorCoeff);
          wr += r[j] * weight;
          wg += g[j] * weight;
          wb += b[j] * weight;
          wsum += weight;
          k += 1;
        }
      }
      outR[i] = wr / wsum;
      outG[i] = wg / wsum;
      outB[i] = wb / wsum;
    }
  }
  return [outR, outG, outB];
}

export function enhanceMenuScan(imageData) {
  const { width, height, data } = imageData;
  const n = width * height;
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  for (let i = 0; i < data.length; i += 4) {
    meanR += data[i];
    meanG += data[i + 1];
    meanB += data[i + 2];
  }
  meanR /= n;
  meanG /= n;
  meanB /= n;
  const gray = (meanR + meanG + meanB) / 3;
  const sr = Math.max(0.84, Math.min(1.16, gray / Math.max(meanR, 8)));
  const sg = Math.max(0.84, Math.min(1.16, gray / Math.max(meanG, 8)));
  const sb = Math.max(0.84, Math.min(1.16, gray / Math.max(meanB, 8)));

  const light = new Uint8ClampedArray(n);
  const aCh = new Uint8ClampedArray(n);
  const bCh = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const [l, a, b] = rgbToLab8(data[i] * sr, data[i + 1] * sg, data[i + 2] * sb);
    light[p] = l;
    aCh[p] = a;
    bCh[p] = b;
  }

  const equalized = claheChannel(light, width, height, 8, 2.1);
  const rgbR = new Uint8ClampedArray(n);
  const rgbG = new Uint8ClampedArray(n);
  const rgbB = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p += 1) {
    const [r, g, b] = lab8ToRgb(equalized[p], aCh[p], bCh[p]);
    rgbR[p] = r;
    rgbG[p] = g;
    rgbB[p] = b;
  }

  const [softR, softG, softB] = bilateralRgb(rgbR, rgbG, rgbB, width, height, 5, 22, 22);
  const { kernel, radius } = gaussianKernel(1.15);
  const blurR = blurChannel(softR, width, height, kernel, radius);
  const blurG = blurChannel(softG, width, height, kernel, radius);
  const blurB = blurChannel(softB, width, height, kernel, radius);

  const out = new ImageData(width, height);
  for (let i = 0, p = 0; i < out.data.length; i += 4, p += 1) {
    out.data[i] = clamp255(1.42 * softR[p] - 0.42 * blurR[p]);
    out.data[i + 1] = clamp255(1.42 * softG[p] - 0.42 * blurG[p]);
    out.data[i + 2] = clamp255(1.42 * softB[p] - 0.42 * blurB[p]);
    out.data[i + 3] = 255;
  }
  return out;
}
