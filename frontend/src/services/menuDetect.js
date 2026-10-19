function ycbcrAt(data, i) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
}

function chromaDist(a, b) {
  return Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function seedFromClick(data, width, height, px, py) {
  const center = ycbcrAt(data, (py * width + px) * 4);
  const radius = Math.max(4, Math.round(width * 0.012));
  const acc = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, py - radius); y <= Math.min(height - 1, py + radius); y += 1) {
    for (let x = Math.max(0, px - radius); x <= Math.min(width - 1, px + radius); x += 1) {
      const color = ycbcrAt(data, (y * width + x) * 4);
      if (chromaDist(color, center) > 12 || Math.abs(color[0] - center[0]) > 36) continue;
      acc[0] += color[0];
      acc[1] += color[1];
      acc[2] += color[2];
      n += 1;
    }
  }
  return n ? [acc[0] / n, acc[1] / n, acc[2] / n] : center;
}

function matchesSeed(color, seed, lumaTol, chromaTol) {
  return Math.abs(color[0] - seed[0]) <= lumaTol && chromaDist(color, seed) <= chromaTol;
}

function floodMask(data, width, height, px, py, seed, lumaTol, chromaTol) {
  const mask = new Uint8Array(width * height);
  const qx = [px];
  const qy = [py];
  mask[py * width + px] = 1;
  let head = 0;
  let count = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    count += 1;
    const next = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const idx = ny * width + nx;
      if (mask[idx]) continue;
      if (!matchesSeed(ycbcrAt(data, idx * 4), seed, lumaTol, chromaTol)) continue;
      mask[idx] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return { mask, count };
}

function dilate(mask, width, height, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let yy = y0; yy <= y1; yy += 1) out.fill(1, yy * width + x0, yy * width + x1 + 1);
    }
  }
  return out;
}

function erode(mask, width, height, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let keep = 1;
      for (let yy = y - radius; yy <= y + radius && keep; yy += 1) {
        for (let xx = x - radius; xx <= x + radius; xx += 1) {
          if (!mask[yy * width + xx]) {
            keep = 0;
            break;
          }
        }
      }
      out[y * width + x] = keep;
    }
  }
  return out;
}

function closeMask(mask, width, height, radius) {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

function boundaryPoints(mask, width, height) {
  const points = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      if (!mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function minAreaQuad(points) {
  let best = null;
  let bestArea = Infinity;
  for (let deg = 0; deg < 90; deg += 2) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const x = p.x * c + p.y * s;
      const y = -p.x * s + p.y * c;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      best = { minX, minY, maxX, maxY, c, s };
    }
  }
  const unrot = (x, y) => ({ x: x * best.c - y * best.s, y: x * best.s + y * best.c });
  return [
    unrot(best.minX, best.minY),
    unrot(best.maxX, best.minY),
    unrot(best.maxX, best.maxY),
    unrot(best.minX, best.maxY),
  ];
}

function orderCorners(corners) {
  const sorted = [...corners].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

function shrinkQuad(corners, width, height, pad = 0.012) {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  return corners.map((p) => ({
    x: Math.max(0, Math.min(width - 1, p.x + (cx - p.x) * pad)),
    y: Math.max(0, Math.min(height - 1, p.y + (cy - p.y) * pad)),
  }));
}

function pointInQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const next = cross > 0 ? 1 : -1;
    if (!sign) sign = next;
    else if (sign !== next) return false;
  }
  return true;
}

function quadOccupancy(mask, width, height, quad) {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  let inside = 0;
  let painted = 0;
  const step = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) / 90));
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInQuad({ x, y }, quad)) continue;
      inside += 1;
      if (mask[y * width + x]) painted += 1;
    }
  }
  return inside ? painted / inside : 0;
}

function looksLikeMenu(corners, width, height) {
  const [tl, tr, br, bl] = corners;
  const top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const right = Math.hypot(br.x - tr.x, br.y - tr.y);
  const area = 0.5 * Math.abs(
    tl.x * tr.y +
      tr.x * br.y +
      br.x * bl.y +
      bl.x * tl.y -
      (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x),
  );
  const img = width * height;
  const ratio = Math.max(top, bottom) / Math.max(Math.max(left, right), 1);
  return area > img * 0.08 && area < img * 0.94 && ratio > 0.35 && ratio < 3.4;
}

export function detectMenuQuad(imageData, nx, ny) {
  const { width, height, data } = imageData;
  const px = Math.max(0, Math.min(width - 1, Math.round(nx * (width - 1))));
  const py = Math.max(0, Math.min(height - 1, Math.round(ny * (height - 1))));
  const seed = seedFromClick(data, width, height, px, py);
  const tries = [
    { luma: 38, chroma: 10 },
    { luma: 52, chroma: 14 },
    { luma: 68, chroma: 18 },
    { luma: 84, chroma: 22 },
  ];
  let best = null;

  for (const tol of tries) {
    const { mask, count } = floodMask(data, width, height, px, py, seed, tol.luma, tol.chroma);
    const ratio = count / (width * height);
    if (ratio < 0.05 || ratio > 0.88) continue;
    const closed = closeMask(mask, width, height, 1);
    const edge = boundaryPoints(closed, width, height);
    if (edge.length < 20) continue;
    const hull = convexHull(edge);
    if (hull.length < 4) continue;
    let quad = orderCorners(minAreaQuad(hull));
    let occupancy = quadOccupancy(closed, width, height, quad);
    for (let i = 0; i < 8 && occupancy < 0.9; i += 1) {
      quad = shrinkQuad(quad, width, height, 0.018);
      occupancy = quadOccupancy(closed, width, height, quad);
    }
    if (!looksLikeMenu(quad, width, height) || occupancy < 0.84) continue;
    const score = occupancy * 2 + ratio;
    if (!best || score > best.score) best = { quad, score };
  }

  if (!best) return null;
  return {
    corners: best.quad.map((p) => ({ x: p.x / width, y: p.y / height })),
  };
}

function gaussianElim(a, b) {
  const n = b.length;
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    }
    [a[i], a[pivot]] = [a[pivot], a[i]];
    [b[i], b[pivot]] = [b[pivot], b[i]];
    const diag = a[i][i];
    if (Math.abs(diag) < 1e-10) return null;
    for (let j = i; j < n; j += 1) a[i][j] /= diag;
    b[i] /= diag;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const f = a[r][i];
      for (let j = i; j < n; j += 1) a[r][j] -= f * a[i][j];
      b[r] -= f * b[i];
    }
  }
  return b;
}

function homography(src, dst) {
  const a = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const s = src[i];
    const d = dst[i];
    a.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    a.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }
  const h = gaussianElim(a.map((row) => [...row]), [...b]);
  if (!h) return null;
  return [...h, 1];
}

function applyH(h, x, y) {
  const z = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / z, y: (h[3] * x + h[4] * y + h[5]) / z };
}

function cubic(a, b, c, d, t) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

function sampleChannel(data, width, height, x, y, channel) {
  const xx = Math.max(0, Math.min(width - 1, x));
  const yy = Math.max(0, Math.min(height - 1, y));
  return data[(yy * width + xx) * 4 + channel];
}

function sampleBicubic(data, width, height, x, y) {
  if (x < 1 || y < 1 || x >= width - 2 || y >= height - 2) {
    if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return [248, 244, 236, 255];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const out = [0, 0, 0, 255];
  for (let c = 0; c < 3; c += 1) {
    const col = [];
    for (let j = -1; j <= 2; j += 1) {
      const row = [];
      for (let i = -1; i <= 2; i += 1) {
        row.push(sampleChannel(data, width, height, x0 + i, y0 + j, c));
      }
      col.push(cubic(row[0], row[1], row[2], row[3], tx));
    }
    out[c] = Math.max(0, Math.min(255, cubic(col[0], col[1], col[2], col[3], ty)));
  }
  return out;
}

export function warpMenu(imageData, corners, { maxSide = 1600 } = {}) {
  const { width, height, data } = imageData;
  const src = corners.map((p) => ({ x: p.x * width, y: p.y * height }));
  const [tl, tr, br, bl] = src;
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hL = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hR = Math.hypot(br.x - tr.x, br.y - tr.y);
  let outW = Math.max(wTop, wBot);
  let outH = Math.max(hL, hR);
  const scale = Math.min(1, maxSide / Math.max(outW, outH));
  outW = Math.max(240, Math.round(outW * scale));
  outH = Math.max(320, Math.round(outH * scale));
  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = homography(dst, src);
  if (!h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(outW, outH);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const p = applyH(h, x, y);
      const pix = sampleBicubic(data, width, height, p.x, p.y);
      const i = (y * outW + x) * 4;
      out.data[i] = pix[0];
      out.data[i + 1] = pix[1];
      out.data[i + 2] = pix[2];
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
