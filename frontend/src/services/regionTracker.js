const TRACK_MAX = 360;
const PYRAMID_LEVELS = 3;
const WIN = 7;
const LK_ITERS = 7;
const MAX_POINTS = 28;
const FB_ERR = 1.8;

function imageToGray(imageData) {
  const sw = imageData.width;
  const sh = imageData.height;
  const scale = Math.min(1, TRACK_MAX / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const gray = new Uint8Array(width * height);
  const { data } = imageData;
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / width));
      const i = (sy * sw + sx) * 4;
      gray[y * width + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
  }
  return { gray, width, height };
}

function downsample(gray, width, height) {
  const w2 = Math.max(1, width >> 1);
  const h2 = Math.max(1, height >> 1);
  const out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y += 1) {
    const y0 = Math.min(height - 1, y * 2);
    const y1 = Math.min(height - 1, y0 + 1);
    for (let x = 0; x < w2; x += 1) {
      const x0 = Math.min(width - 1, x * 2);
      const x1 = Math.min(width - 1, x0 + 1);
      out[y * w2 + x] =
        (gray[y0 * width + x0] + gray[y0 * width + x1] + gray[y1 * width + x0] + gray[y1 * width + x1]) >> 2;
    }
  }
  return { gray: out, width: w2, height: h2 };
}

function buildPyramid(gray, width, height) {
  const pyramid = [{ gray, width, height }];
  for (let i = 1; i < PYRAMID_LEVELS; i += 1) {
    const prev = pyramid[i - 1];
    pyramid.push(downsample(prev.gray, prev.width, prev.height));
  }
  return pyramid;
}

function sample(gray, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return null;
  const x0 = x | 0;
  const y0 = y | 0;
  const dx = x - x0;
  const dy = y - y0;
  const i = y0 * width + x0;
  return (
    gray[i] * (1 - dx) * (1 - dy) +
    gray[i + 1] * dx * (1 - dy) +
    gray[i + width] * (1 - dx) * dy +
    gray[i + width + 1] * dx * dy
  );
}

function trackPoint(prev, next, x, y, u0, v0) {
  const half = (WIN / 2) | 0;
  let u = u0;
  let v = v0;
  for (let iter = 0; iter < LK_ITERS; iter += 1) {
    let ixx = 0;
    let ixy = 0;
    let iyy = 0;
    let ixt = 0;
    let iyt = 0;
    let n = 0;
    for (let dy = -half; dy <= half; dy += 1) {
      for (let dx = -half; dx <= half; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        const i0 = sample(prev.gray, prev.width, prev.height, px, py);
        const i1 = sample(next.gray, next.width, next.height, px + u, py + v);
        const ix1 = sample(prev.gray, prev.width, prev.height, px + 1, py);
        const ix0 = sample(prev.gray, prev.width, prev.height, px - 1, py);
        const iy1 = sample(prev.gray, prev.width, prev.height, px, py + 1);
        const iy0 = sample(prev.gray, prev.width, prev.height, px, py - 1);
        if (i0 == null || i1 == null || ix1 == null || ix0 == null || iy1 == null || iy0 == null) continue;
        const ix = (ix1 - ix0) * 0.5;
        const iy = (iy1 - iy0) * 0.5;
        const it = i1 - i0;
        ixx += ix * ix;
        ixy += ix * iy;
        iyy += iy * iy;
        ixt += ix * it;
        iyt += iy * it;
        n += 1;
      }
    }
    const det = ixx * iyy - ixy * ixy;
    if (n < 10 || Math.abs(det) < 1e-2) return null;
    const du = (-iyy * ixt + ixy * iyt) / det;
    const dv = (ixy * ixt - ixx * iyt) / det;
    u += du;
    v += dv;
    if (du * du + dv * dv < 0.01) break;
  }
  return { u, v };
}

function lkPyramid(prevPyr, nextPyr, x, y) {
  let u = 0;
  let v = 0;
  for (let level = prevPyr.length - 1; level >= 0; level -= 1) {
    const scale = 1 << level;
    const tracked = trackPoint(prevPyr[level], nextPyr[level], x / scale, y / scale, u, v);
    if (!tracked) return null;
    u = tracked.u;
    v = tracked.v;
    if (level > 0) {
      u *= 2;
      v *= 2;
    }
  }
  return { x: x + u, y: y + v };
}

function minEigen(gray, width, x, y) {
  let gxx = 0;
  let gxy = 0;
  let gyy = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const i = (y + dy) * width + (x + dx);
      const ix = gray[i + 1] - gray[i - 1];
      const iy = gray[i + width] - gray[i - width];
      gxx += ix * ix;
      gxy += ix * iy;
      gyy += iy * iy;
    }
  }
  const trace = gxx + gyy;
  const diff = Math.hypot(gxx - gyy, 2 * gxy);
  return (trace - diff) * 0.5;
}

function selectFeatures(gray, width, height, boxPx) {
  const padX = Math.max(10, boxPx.w * 0.35);
  const padY = Math.max(8, boxPx.h * 0.9);
  const x0 = Math.max(2, Math.floor(boxPx.x - padX));
  const y0 = Math.max(2, Math.floor(boxPx.y - padY));
  const x1 = Math.min(width - 2, Math.ceil(boxPx.x + boxPx.w + padX));
  const y1 = Math.min(height - 2, Math.ceil(boxPx.y + boxPx.h + padY));
  const candidates = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const score = minEigen(gray, width, x, y);
      if (score > 80) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const points = [];
  for (const cand of candidates) {
    if (points.some((p) => Math.abs(p.x - cand.x) < 5 && Math.abs(p.y - cand.y) < 5)) continue;
    points.push({ x: cand.x, y: cand.y });
    if (points.length >= MAX_POINTS) break;
  }
  const gx = 5;
  const gy = 3;
  for (let j = 0; j < gy; j += 1) {
    for (let i = 0; i < gx; i += 1) {
      const x = boxPx.x + ((i + 0.5) * boxPx.w) / gx;
      const y = boxPx.y + ((j + 0.5) * boxPx.h) / gy;
      if (x < 2 || y < 2 || x > width - 3 || y > height - 3) continue;
      if (points.some((p) => Math.hypot(p.x - x, p.y - y) < 4)) continue;
      points.push({ x, y });
    }
  }
  return points.slice(0, MAX_POINTS);
}

function fitSimilarity(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  let mxp = 0;
  let myp = 0;
  for (const p of pairs) {
    mx += p.x;
    my += p.y;
    mxp += p.xp;
    myp += p.yp;
  }
  mx /= n;
  my /= n;
  mxp /= n;
  myp /= n;
  let numRe = 0;
  let numIm = 0;
  let den = 0;
  for (const p of pairs) {
    const zx = p.x - mx;
    const zy = p.y - my;
    const wx = p.xp - mxp;
    const wy = p.yp - myp;
    numRe += zx * wx + zy * wy;
    numIm += zx * wy - zy * wx;
    den += zx * zx + zy * zy;
  }
  if (den < 1e-4) return null;
  const a = numRe / den;
  const b = numIm / den;
  const scale = Math.hypot(a, b);
  if (scale < 0.55 || scale > 1.8) return null;
  return {
    a,
    b,
    tx: mxp - (a * mx - b * my),
    ty: myp - (b * mx + a * my),
  };
}

function applySim(sim, x, y) {
  return { x: sim.a * x - sim.b * y + sim.tx, y: sim.b * x + sim.a * y + sim.ty };
}

function invertSim(sim) {
  const s2 = sim.a * sim.a + sim.b * sim.b;
  if (s2 < 1e-8) return null;
  return {
    a: sim.a / s2,
    b: -sim.b / s2,
    tx: (-sim.a * sim.tx - sim.b * sim.ty) / s2,
    ty: (sim.b * sim.tx - sim.a * sim.ty) / s2,
  };
}

function ransacSimilarity(pairs) {
  if (pairs.length < 3) return fitSimilarity(pairs);
  let best = null;
  let bestCount = 0;
  const tries = Math.min(24, pairs.length * 4);
  for (let t = 0; t < tries; t += 1) {
    const i = (Math.random() * pairs.length) | 0;
    let j = (Math.random() * pairs.length) | 0;
    if (j === i) j = (j + 1) % pairs.length;
    const guess = fitSimilarity([pairs[i], pairs[j], pairs[(j + 2) % pairs.length]]);
    if (!guess) continue;
    const inliers = pairs.filter((p) => {
      const q = applySim(guess, p.x, p.y);
      return Math.hypot(q.x - p.xp, q.y - p.yp) < 2.6;
    });
    if (inliers.length > bestCount) {
      bestCount = inliers.length;
      best = fitSimilarity(inliers);
    }
  }
  return bestCount >= 3 ? best : fitSimilarity(pairs);
}

class OneEuro {
  constructor(minCutoff, beta) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = 1;
    this.prev = null;
    this.dx = 0;
    this.t = null;
  }

  filter(value, t) {
    if (this.prev == null) {
      this.prev = value;
      this.t = t;
      return value;
    }
    const dt = Math.max(t - this.t, 1 / 120);
    const dx = (value - this.prev) / dt;
    const ad = this.alpha(dt, this.dcutoff);
    this.dx += ad * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(dt, cutoff);
    this.prev += a * (value - this.prev);
    this.t = t;
    return this.prev;
  }

  alpha(dt, cutoff) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
}

function aabbFromCorners(corners, width, height) {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x: x / width,
    y: y / height,
    w: (Math.max(...xs) - x) / width,
    h: (Math.max(...ys) - y) / height,
    corners: corners.map((c) => ({ x: c.x / width, y: c.y / height })),
  };
}

export function createRegionTracker() {
  let prevPyr = null;
  let width = 0;
  let height = 0;
  let features = [];
  let lockCorners = null;
  let missed = 0;
  let frames = 0;
  const euroX = new OneEuro(1.15, 0.04);
  const euroY = new OneEuro(1.15, 0.04);
  const euroA = new OneEuro(0.35, 0.008);
  const euroB = new OneEuro(0.35, 0.008);

  function currentBox(sim) {
    const corners = lockCorners.map((c) => applySim(sim, c.x, c.y));
    return { ...aabbFromCorners(corners, width, height), missed };
  }

  return {
    lock(imageData, box) {
      const frame = imageToGray(imageData);
      width = frame.width;
      height = frame.height;
      prevPyr = buildPyramid(frame.gray, width, height);
      const boxPx = {
        x: box.x * width,
        y: box.y * height,
        w: box.w * width,
        h: box.h * height,
      };
      lockCorners = [
        { x: boxPx.x, y: boxPx.y },
        { x: boxPx.x + boxPx.w, y: boxPx.y },
        { x: boxPx.x + boxPx.w, y: boxPx.y + boxPx.h },
        { x: boxPx.x, y: boxPx.y + boxPx.h },
      ];
      const pts = selectFeatures(frame.gray, width, height, boxPx);
      features = pts.map((p) => ({ lock: { x: p.x, y: p.y }, cur: { x: p.x, y: p.y } }));
      missed = 0;
      frames = 0;
      euroX.prev = null;
      euroY.prev = null;
      euroA.prev = null;
      euroB.prev = null;
    },
    update(imageData) {
      if (!prevPyr || !lockCorners) return null;
      const frame = imageToGray(imageData);
      if (frame.width !== width || frame.height !== height) {
        width = frame.width;
        height = frame.height;
      }
      const nextPyr = buildPyramid(frame.gray, frame.width, frame.height);
      const pairs = [];
      const kept = [];
      for (const feature of features) {
        const forward = lkPyramid(prevPyr, nextPyr, feature.cur.x, feature.cur.y);
        if (!forward) continue;
        const back = lkPyramid(nextPyr, prevPyr, forward.x, forward.y);
        if (!back || Math.hypot(back.x - feature.cur.x, back.y - feature.cur.y) > FB_ERR) continue;
        const next = { lock: feature.lock, cur: { x: forward.x, y: forward.y } };
        kept.push(next);
        pairs.push({ x: feature.lock.x, y: feature.lock.y, xp: forward.x, yp: forward.y });
      }

      prevPyr = nextPyr;
      frames += 1;
      const simRaw = ransacSimilarity(pairs);
      if (!simRaw) {
        missed += 1;
        features = kept;
        return { missed, lost: true };
      }

      const t = performance.now() / 1000;
      const sim = {
        a: euroA.filter(simRaw.a, t),
        b: euroB.filter(simRaw.b, t),
        tx: euroX.filter(simRaw.tx, t),
        ty: euroY.filter(simRaw.ty, t),
      };
      missed = 0;
      features = kept;

      if (features.length < 12 || frames % 12 === 0) {
        const box = aabbFromCorners(
          lockCorners.map((c) => applySim(sim, c.x, c.y)),
          width,
          height,
        );
        const inv = invertSim(sim);
        if (inv) {
          const extras = selectFeatures(frame.gray, width, height, {
            x: box.x * width,
            y: box.y * height,
            w: box.w * width,
            h: box.h * height,
          });
          for (const p of extras) {
            if (features.some((f) => Math.hypot(f.cur.x - p.x, f.cur.y - p.y) < 5)) continue;
            const lock = applySim(inv, p.x, p.y);
            features.push({ lock, cur: { x: p.x, y: p.y } });
            if (features.length >= MAX_POINTS) break;
          }
        }
      }

      return currentBox(sim);
    },
    clear() {
      prevPyr = null;
      features = [];
      lockCorners = null;
      missed = 0;
    },
  };
}
