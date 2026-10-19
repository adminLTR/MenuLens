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

function lumaAt(data, i) {
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
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

function isConvexQuad(corners) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const d = corners[(i + 2) % 4];
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(cross) < 1e-4) return false;
    const next = cross > 0 ? 1 : -1;
    if (!sign) sign = next;
    else if (sign !== next) return false;
  }
  return true;
}

function minAreaQuad(points, { fromDeg = -28, toDeg = 28, step = 2 } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (let deg = fromDeg; deg <= toDeg; deg += step) {
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
    const score = area * (1 + Math.abs(deg) * 0.01);
    if (score < bestScore) {
      bestScore = score;
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
  const pts = corners.map((p) => ({ x: p.x, y: p.y }));
  let tl = pts[0];
  let tr = pts[0];
  let br = pts[0];
  let bl = pts[0];
  for (const p of pts) {
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x + p.y > br.x + br.y) br = p;
    if (p.x - p.y > tr.x - tr.y) tr = p;
    if (p.x - p.y < bl.x - bl.y) bl = p;
  }
  const ordered = [tl, tr, br, bl];
  const unique = new Set(ordered.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
  if (unique.size === 4 && isConvexQuad(ordered)) return ordered;
  const sorted = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
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

function quadArea(corners) {
  const [tl, tr, br, bl] = corners;
  return 0.5 * Math.abs(
    tl.x * tr.y +
      tr.x * br.y +
      br.x * bl.y +
      bl.x * tl.y -
      (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x),
  );
}

function looksLikeMenu(corners, width, height) {
  if (!isConvexQuad(corners)) return false;
  const [tl, tr, br, bl] = corners;
  const top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const right = Math.hypot(br.x - tr.x, br.y - tr.y);
  const minSide = Math.min(width, height) * 0.1;
  if (top < minSide || bottom < minSide || left < minSide || right < minSide) return false;
  if (Math.min(tl.y, tr.y) > Math.max(bl.y, br.y) - 4) return false;
  if (Math.min(tl.x, bl.x) > Math.max(tr.x, br.x) - 4) return false;
  const area = quadArea(corners);
  const img = width * height;
  const ratio = Math.max(top, bottom) / Math.max(Math.max(left, right), 1);
  const skew = Math.max(top, bottom) / Math.max(Math.min(top, bottom), 1);
  const sideSkew = Math.max(left, right) / Math.max(Math.min(left, right), 1);
  return (
    area > img * 0.06 &&
    area < img * 0.92 &&
    ratio > 0.28 &&
    ratio < 4.2 &&
    skew < 2.3 &&
    sideSkew < 2.3
  );
}

function toGray(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function boxBlur(gray, width, height, radius) {
  const tmp = new Float32Array(gray.length);
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let n = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const row = y * width;
      for (let xx = x0; xx <= x1; xx += 1) {
        sum += gray[row + xx];
        n += 1;
      }
      tmp[row + x] = sum / n;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let n = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let yy = y0; yy <= y1; yy += 1) {
        sum += tmp[yy * width + x];
        n += 1;
      }
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

function sobel(gray, width, height) {
  const mag = new Float32Array(width * height);
  const gxA = new Float32Array(width * height);
  const gyA = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] +
        gray[i - width + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + width - 1] +
        gray[i + width + 1];
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1];
      gxA[i] = gx;
      gyA[i] = gy;
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return { mag, gx: gxA, gy: gyA };
}

function sampleMap(map, width, height, x, y) {
  const xx = Math.max(0, Math.min(width - 1.001, x));
  const yy = Math.max(0, Math.min(height - 1.001, y));
  const x0 = xx | 0;
  const y0 = yy | 0;
  const dx = xx - x0;
  const dy = yy - y0;
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  return (
    map[y0 * width + x0] * (1 - dx) * (1 - dy) +
    map[y0 * width + x1] * dx * (1 - dy) +
    map[y1 * width + x0] * (1 - dx) * dy +
    map[y1 * width + x1] * dx * dy
  );
}

function magPercentile(mag, p) {
  const hist = new Uint32Array(512);
  let n = 0;
  for (let i = 0; i < mag.length; i += 3) {
    hist[Math.min(511, mag[i] | 0)] += 1;
    n += 1;
  }
  const target = n * p;
  let acc = 0;
  for (let i = 0; i < hist.length; i += 1) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 24;
}

function adaptiveMagStop(mag) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < mag.length; i += 7) {
    sum += mag[i];
    n += 1;
  }
  return Math.max(16, (sum / n) * 1.55);
}

function borderMedian(data, width, height, band = 6) {
  const ys = [];
  const cbs = [];
  const crs = [];
  const add = (x, y) => {
    const color = ycbcrAt(data, (y * width + x) * 4);
    ys.push(color[0]);
    cbs.push(color[1]);
    crs.push(color[2]);
  };
  for (let x = 0; x < width; x += 1) {
    for (let t = 0; t < band; t += 1) {
      add(x, t);
      add(x, height - 1 - t);
    }
  }
  for (let y = band; y < height - band; y += 1) {
    for (let t = 0; t < band; t += 1) {
      add(t, y);
      add(width - 1 - t, y);
    }
  }
  return [median(ys), median(cbs), median(crs)];
}

function matchesBg(color, seed, lumaTol, chromaTol) {
  return Math.abs(color[0] - seed[0]) <= lumaTol && chromaDist(color, seed) <= chromaTol;
}

function floodFromBorder(data, mag, width, height, seed, magStop, lumaTol, chromaTol) {
  const bg = new Uint8Array(width * height);
  const qx = [];
  const qy = [];
  const tryPush = (x, y, forceColor) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (bg[i]) return;
    const color = ycbcrAt(data, i * 4);
    if (!matchesBg(color, seed, lumaTol, chromaTol) && !forceColor) return;
    const onBorder = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
    if (!onBorder && mag[i] > magStop) return;
    bg[i] = 1;
    qx.push(x);
    qy.push(y);
  };
  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0, false);
    tryPush(x, height - 1, false);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y, false);
    tryPush(width - 1, y, false);
  }
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    tryPush(x + 1, y, false);
    tryPush(x - 1, y, false);
    tryPush(x, y + 1, false);
    tryPush(x, y - 1, false);
  }
  return bg;
}

function componentQuads(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const quads = [];
  const minCount = width * height * 0.05;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      const qx = [x];
      const qy = [y];
      seen[start] = 1;
      let head = 0;
      let count = 0;
      const border = [];
      while (head < qx.length) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        count += 1;
        const i = cy * width + cx;
        if (
          cx <= 1 ||
          cy <= 1 ||
          cx >= width - 2 ||
          cy >= height - 2 ||
          !mask[i - 1] ||
          !mask[i + 1] ||
          !mask[i - width] ||
          !mask[i + width]
        ) {
          border.push({ x: cx, y: cy });
        }
        const next = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of next) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }
      if (count < minCount || border.length < 16) continue;
      const step = Math.max(1, Math.floor(border.length / 480));
      const pts = [];
      for (let i = 0; i < border.length; i += step) pts.push(border[i]);
      const hull = convexHull(pts);
      if (hull.length < 4) continue;
      quads.push(orderCorners(minAreaQuad(hull)));
    }
  }
  return quads;
}

function quadsFromBorderFlood(data, mag, width, height) {
  const seed = borderMedian(data, width, height, 6);
  const magStop = adaptiveMagStop(mag);
  const tries = [
    { luma: 50, chroma: 26 },
    { luma: 36, chroma: 18 },
    { luma: 24, chroma: 12 },
  ];
  const quads = [];
  for (const tol of tries) {
    const bg = floodFromBorder(data, mag, width, height, seed, magStop, tol.luma, tol.chroma);
    const fg = new Uint8Array(bg.length);
    for (let i = 0; i < bg.length; i += 1) fg[i] = bg[i] ? 0 : 1;
    const found = componentQuads(fg, width, height);
    quads.push(...found);
    if (found.some((q) => looksLikeMenu(q, width, height) && borderHug(q, width, height) < 0.5)) {
      break;
    }
  }
  return quads;
}

function angleDiff(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

function splitOrientations(lines) {
  let bestA = [];
  let bestB = [];
  for (const ref of lines) {
    const a = [];
    const b = [];
    for (const line of lines) {
      const d = angleDiff(line.theta, ref.theta);
      if (d < Math.PI / 5.5) a.push(line);
      else if (d > Math.PI / 3.1) b.push(line);
    }
    if (Math.min(a.length, b.length) > Math.min(bestA.length, bestB.length)) {
      bestA = a;
      bestB = b;
    }
  }
  return [bestA, bestB];
}

function lineIntersect(l1, l2) {
  const a1 = Math.cos(l1.theta);
  const b1 = Math.sin(l1.theta);
  const a2 = Math.cos(l2.theta);
  const b2 = Math.sin(l2.theta);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 0.08) return null;
  return {
    x: (b2 * l1.rho - b1 * l2.rho) / det,
    y: (a1 * l2.rho - a2 * l1.rho) / det,
  };
}

function houghLines(mag, gx, gy, width, height) {
  const thresh = Math.max(14, magPercentile(mag, 0.86));
  const nTheta = 90;
  const diag = Math.hypot(width, height);
  const rhoMax = Math.ceil(diag);
  const nRho = rhoMax * 2 + 1;
  const acc = new Float32Array(nTheta * nRho);
  const thetaStep = Math.PI / nTheta;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const i = y * width + x;
      const m = mag[i];
      if (m < thresh) continue;
      let theta = Math.atan2(gy[i], gx[i]);
      if (theta < 0) theta += Math.PI;
      const tBin = Math.min(nTheta - 1, Math.max(0, Math.round(theta / thetaStep) % nTheta));
      for (let dt = -1; dt <= 1; dt += 1) {
        const tb = (tBin + dt + nTheta) % nTheta;
        const th = tb * thetaStep;
        const rho = x * Math.cos(th) + y * Math.sin(th);
        const rb = Math.round(rho + rhoMax);
        if (rb < 1 || rb >= nRho - 1) continue;
        acc[tb * nRho + rb] += m;
      }
    }
  }
  const peaks = [];
  let maxAcc = 0;
  for (let i = 0; i < acc.length; i += 1) if (acc[i] > maxAcc) maxAcc = acc[i];
  const floor = maxAcc * 0.16;
  for (let t = 0; t < nTheta; t += 1) {
    for (let r = 2; r < nRho - 2; r += 1) {
      const i = t * nRho + r;
      const v = acc[i];
      if (v < floor) continue;
      let local = true;
      for (let dt = -2; dt <= 2 && local; dt += 1) {
        for (let dr = -2; dr <= 2; dr += 1) {
          if (!dt && !dr) continue;
          const tt = (t + dt + nTheta) % nTheta;
          const rr = r + dr;
          if (rr < 0 || rr >= nRho) continue;
          if (acc[tt * nRho + rr] > v) {
            local = false;
            break;
          }
        }
      }
      if (local) peaks.push({ theta: t * thetaStep, rho: r - rhoMax, score: v });
    }
  }
  peaks.sort((a, b) => b.score - a.score);
  return peaks.slice(0, 16);
}

function quadsFromHough(mag, gx, gy, width, height) {
  const lines = houghLines(mag, gx, gy, width, height);
  if (lines.length < 4) return [];
  const [groupA, groupB] = splitOrientations(lines);
  if (groupA.length < 2 || groupB.length < 2) return [];
  const quads = [];
  const margin = Math.min(width, height) * 0.12;
  for (let i = 0; i < groupA.length; i += 1) {
    for (let j = i + 1; j < groupA.length; j += 1) {
      if (Math.abs(groupA[i].rho - groupA[j].rho) < Math.min(width, height) * 0.12) continue;
      for (let k = 0; k < groupB.length; k += 1) {
        for (let m = k + 1; m < groupB.length; m += 1) {
          if (Math.abs(groupB[k].rho - groupB[m].rho) < Math.min(width, height) * 0.12) continue;
          const pts = [
            lineIntersect(groupA[i], groupB[k]),
            lineIntersect(groupA[i], groupB[m]),
            lineIntersect(groupA[j], groupB[k]),
            lineIntersect(groupA[j], groupB[m]),
          ];
          if (pts.some((p) => !p)) continue;
          if (
            pts.some(
              (p) => p.x < -margin || p.y < -margin || p.x > width + margin || p.y > height + margin,
            )
          ) {
            continue;
          }
          quads.push(
            orderCorners(
              pts.map((p) => ({
                x: Math.max(0, Math.min(width - 1, p.x)),
                y: Math.max(0, Math.min(height - 1, p.y)),
              })),
            ),
          );
        }
      }
    }
  }
  return quads;
}

function insetQuad(corners, pad = 0.01) {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  return corners.map((p) => ({
    x: p.x + (cx - p.x) * pad,
    y: p.y + (cy - p.y) * pad,
  }));
}

function sideOnImageBorder(a, b, width, height) {
  const m = Math.max(4, Math.min(width, height) * 0.025);
  return (
    (a.x < m && b.x < m) ||
    (a.x > width - 1 - m && b.x > width - 1 - m) ||
    (a.y < m && b.y < m) ||
    (a.y > height - 1 - m && b.y > height - 1 - m)
  );
}

function borderHug(corners, width, height) {
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    if (sideOnImageBorder(corners[i], corners[(i + 1) % 4], width, height)) n += 1;
  }
  return n / 4;
}

function quadEdgeScore(mag, width, height, corners) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(8, Math.round(len / 2));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      sum += sampleMap(mag, width, height, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

function quadBorderContrast(data, width, height, corners) {
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  const dist = Math.max(5, Math.min(width, height) * 0.018);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len;
    let ny = -dx / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const steps = 7;
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const ix = Math.round(Math.max(0, Math.min(width - 1, x + nx * dist)));
      const iy = Math.round(Math.max(0, Math.min(height - 1, y + ny * dist)));
      const ox = Math.round(Math.max(0, Math.min(width - 1, x - nx * dist)));
      const oy = Math.round(Math.max(0, Math.min(height - 1, y - ny * dist)));
      sum += Math.abs(lumaAt(data, (iy * width + ix) * 4) - lumaAt(data, (oy * width + ox) * 4));
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

function scoreQuad(corners, mag, data, width, height) {
  const area = quadArea(corners) / (width * height);
  const edges = quadEdgeScore(mag, width, height, corners);
  const contrast = quadBorderContrast(data, width, height, corners);
  const hug = borderHug(corners, width, height);
  return edges * 1.35 + contrast * 0.9 + Math.min(area, 0.72) * 48 - hug * 70 - Math.max(0, area - 0.8) * 80;
}

function considerQuad(raw, mag, data, width, height, state) {
  const corners = orderCorners(raw);
  if (!looksLikeMenu(corners, width, height)) return;
  const score = scoreQuad(corners, mag, data, width, height);
  if (score > state.bestScore) {
    state.bestScore = score;
    state.best = corners;
  }
}

export function detectMenuQuad(imageData) {
  const { width, height, data } = imageData;
  const gray = boxBlur(toGray(data, width, height), width, height, 2);
  const { mag, gx, gy } = sobel(gray, width, height);
  const state = { best: null, bestScore: -Infinity };
  for (const quad of quadsFromBorderFlood(data, mag, width, height)) {
    considerQuad(quad, mag, data, width, height, state);
  }
  const strongDoc = state.best && state.bestScore > 70 && borderHug(state.best, width, height) < 0.26;
  if (!strongDoc) {
    for (const quad of quadsFromHough(mag, gx, gy, width, height)) {
      considerQuad(quad, mag, data, width, height, state);
    }
  }
  if (!state.best) return null;
  return {
    corners: insetQuad(state.best, 0.008).map((p) => ({ x: p.x / width, y: p.y / height })),
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
  const h = gaussianElim(
    a.map((row) => [...row]),
    [...b],
  );
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
  const src = orderCorners(corners.map((p) => ({ x: p.x * width, y: p.y * height })));
  if (!isConvexQuad(src)) return null;
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
