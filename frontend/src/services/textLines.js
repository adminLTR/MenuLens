function otsuThreshold(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 120;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function dilateX(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      while (x < width && !binary[row + x]) x += 1;
      if (x >= width) break;
      const start = x;
      while (x < width && binary[row + x]) x += 1;
      out.fill(1, row + Math.max(0, start - radius), row + Math.min(width, x + radius));
    }
  }
  return out;
}

function dilateY(binary, width, height, radius) {
  const out = new Uint8Array(binary.length);
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      while (y < height && !binary[y * width + x]) y += 1;
      if (y >= height) break;
      const start = y;
      while (y < height && binary[y * width + x]) y += 1;
      const from = Math.max(0, start - radius);
      const to = Math.min(height, y + radius);
      for (let yy = from; yy < to; yy += 1) out[yy * width + x] = 1;
    }
  }
  return out;
}

function connectedBoxes(binary, width, height) {
  const parent = new Int32Array(width * height);
  parent.fill(-1);
  const find = (index) => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const unite = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!binary[i]) continue;
      parent[i] = i;
      if (x > 0 && binary[i - 1]) unite(i, i - 1);
      if (y > 0 && binary[i - width]) unite(i, i - width);
    }
  }

  const boxes = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (parent[i] < 0) continue;
      const root = find(i);
      let box = boxes.get(root);
      if (!box) {
        box = { x0: x, y0: y, x1: x, y1: y, n: 0 };
        boxes.set(root, box);
      }
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
      box.n += 1;
    }
  }

  return [...boxes.values()].map((box) => ({
    x: box.x0,
    y: box.y0,
    w: box.x1 - box.x0 + 1,
    h: box.y1 - box.y0 + 1,
    n: box.n,
  }));
}

function rowInk(binary, width, box) {
  const counts = [];
  for (let y = box.y; y < box.y + box.h; y += 1) {
    let ink = 0;
    const row = y * width;
    for (let x = box.x; x < box.x + box.w; x += 1) ink += binary[row + x];
    counts.push(ink);
  }
  return counts;
}

function splitTallBox(binary, width, box, medianH) {
  if (box.h < medianH * 1.55) return [box];
  const counts = rowInk(binary, width, box);
  const peak = Math.max(...counts, 1);
  const valley = peak * 0.18;
  const splits = [];
  let inValley = false;
  let valleyStart = 0;
  for (let i = 2; i < counts.length - 2; i += 1) {
    if (counts[i] <= valley) {
      if (!inValley) {
        inValley = true;
        valleyStart = i;
      }
    } else if (inValley) {
      const mid = box.y + Math.round((valleyStart + i - 1) / 2);
      if (mid - box.y > medianH * 0.7 && box.y + box.h - mid > medianH * 0.7) {
        splits.push(mid);
      }
      inValley = false;
    }
  }
  if (!splits.length) return [box];
  const edges = [box.y, ...splits, box.y + box.h];
  const parts = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const y = edges[i];
    const h = edges[i + 1] - y;
    if (h < 4) continue;
    parts.push({ x: box.x, y, w: box.w, h, n: box.n });
  }
  return parts.length ? parts : [box];
}

function mergeSameLine(boxes) {
  const ordered = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  for (const box of ordered) {
    const sibling = merged.find((other) => {
      const sameRow = Math.abs(box.cy - other.cy) <= Math.max(box.h, other.h) * 0.38;
      const gap = box.x > other.x ? box.x - (other.x + other.w) : other.x - (box.x + box.w);
      const close = gap < Math.max(box.h, other.h) * 1.15;
      const similarH = Math.abs(box.h - other.h) / Math.max(box.h, other.h) < 0.45;
      return sameRow && close && similarH && gap >= -Math.min(box.w, other.w) * 0.2;
    });
    if (!sibling) {
      merged.push({ ...box });
      continue;
    }
    const x = Math.min(sibling.x, box.x);
    const y = Math.min(sibling.y, box.y);
    const x2 = Math.max(sibling.x + sibling.w, box.x + box.w);
    const y2 = Math.max(sibling.y + sibling.h, box.y + box.h);
    sibling.x = x;
    sibling.y = y;
    sibling.w = x2 - x;
    sibling.h = y2 - y;
    sibling.cx = x + sibling.w / 2;
    sibling.cy = y + sibling.h / 2;
  }
  return merged;
}

function nearestInk(binary, width, height, px, py, maxR) {
  const start = py * width + px;
  if (binary[start]) return start;
  const seen = new Uint8Array(width * height);
  const qx = [px];
  const qy = [py];
  seen[start] = 1;
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    if (Math.abs(x - px) > maxR || Math.abs(y - py) > maxR) continue;
    const i = y * width + x;
    if (binary[i]) return i;
    const next = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return -1;
}

function looksLikeTextLine(box, width, height) {
  const nw = box.w / width;
  const nh = box.h / height;
  const ratio = box.w / Math.max(box.h, 1);
  return nw > 0.04 && nw < 0.85 && nh > 0.006 && nh < 0.1 && ratio > 1.35 && ratio < 28;
}

function looksLikeTappedText(box, width, height) {
  const nw = box.w / width;
  const nh = box.h / height;
  const ratio = box.w / Math.max(box.h, 1);
  return nw > 0.01 && nw < 0.94 && nh > 0.004 && nh < 0.18 && ratio > 0.55 && ratio < 42;
}

function prepareBinary(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[p] = value;
    sum += value;
  }
  const mean = sum / gray.length;
  const invert = mean < 120;
  const threshold = otsuThreshold(gray);
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    binary[i] = (invert ? gray[i] > threshold : gray[i] < threshold) ? 1 : 0;
  }
  const hx = Math.max(3, Math.round(width * 0.016));
  const closed = dilateY(dilateX(binary, width, height, hx), width, height, 1);
  return { width, height, closed };
}

function collectLineBoxes(closed, width, height) {
  let boxes = connectedBoxes(closed, width, height);
  const area = width * height;
  boxes = boxes.filter((box) => {
    const fill = box.n / Math.max(box.w * box.h, 1);
    return fill > 0.1 && fill < 0.88 && box.w * box.h < area * 0.18;
  });
  const heights = boxes.map((box) => box.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || Math.round(height * 0.025);
  boxes = boxes.flatMap((box) => splitTallBox(closed, width, box, medianH));
  boxes = boxes.map((box) => ({ ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2 }));
  return mergeSameLine(boxes);
}

export function detectLineAtPoint(imageData, nx, ny, { search = 0.04 } = {}) {
  const { width, height, closed } = prepareBinary(imageData);
  const px = Math.max(0, Math.min(width - 1, Math.round(nx * (width - 1))));
  const py = Math.max(0, Math.min(height - 1, Math.round(ny * (height - 1))));
  const seed = nearestInk(closed, width, height, px, py, Math.max(12, Math.round(width * search)));
  if (seed < 0) return null;

  const boxes = collectLineBoxes(closed, width, height);
  const sx = seed % width;
  const sy = Math.floor(seed / width);
  const containing = boxes.filter(
    (box) => sx >= box.x && sx <= box.x + box.w && sy >= box.y && sy <= box.y + box.h,
  );
  let hit = containing.sort((a, b) => a.w * a.h - b.w * b.h)[0];
  if (!hit) {
    const maxDist = Math.max(width * 0.045, 16);
    hit = boxes
      .map((box) => ({
        box,
        dist: Math.hypot(sx - box.cx, sy - box.cy),
      }))
      .filter(
        ({ box, dist }) =>
          dist <= maxDist &&
          sy >= box.y - box.h * 0.5 &&
          sy <= box.y + box.h * 1.5,
      )
      .sort((a, b) => a.dist - b.dist)[0]?.box;
  }
  if (!hit || !looksLikeTappedText(hit, width, height)) return null;
  return {
    x: hit.x / width,
    y: hit.y / height,
    w: hit.w / width,
    h: hit.h / height,
  };
}

export function detectTextLines(imageData) {
  const { width, height, closed } = prepareBinary(imageData);
  return collectLineBoxes(closed, width, height)
    .filter((box) => looksLikeTextLine(box, width, height))
    .map((box) => ({
      x: box.x / width,
      y: box.y / height,
      w: box.w / width,
      h: box.h / height,
    }));
}
