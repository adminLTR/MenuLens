const SCAN_TIMEOUT_MS = 90000;
const MAX_SIDE = 2000;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function coverRect(containerW, containerH, imageW, imageH) {
  const scale = Math.max(containerW / imageW, containerH / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  return {
    scale,
    offsetX: (containerW - drawW) / 2,
    offsetY: (containerH - drawH) / 2,
    drawW,
    drawH,
  };
}

export function mapCoverPoint(nx, ny, container, imageW, imageH) {
  const { offsetX, offsetY, drawW, drawH } = coverRect(
    container.clientWidth,
    container.clientHeight,
    imageW,
    imageH,
  );
  return {
    x: offsetX + nx * drawW,
    y: offsetY + ny * drawH,
  };
}

export function mapCoverBox(bbox, container, imageW, imageH) {
  const { offsetX, offsetY, drawW, drawH } = coverRect(
    container.clientWidth,
    container.clientHeight,
    imageW,
    imageH,
  );
  return {
    left: offsetX + bbox.x * drawW,
    top: offsetY + bbox.y * drawH,
    width: Math.max(bbox.w * drawW, 36),
    height: Math.max(bbox.h * drawH, 28),
  };
}

export function unprojectCoverPoint(clientX, clientY, container, imageW, imageH) {
  const rect = container.getBoundingClientRect();
  const { offsetX, offsetY, drawW, drawH } = coverRect(
    container.clientWidth,
    container.clientHeight,
    imageW,
    imageH,
  );
  const nx = (clientX - rect.left - offsetX) / drawW;
  const ny = (clientY - rect.top - offsetY) / drawH;
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  return { x: nx, y: ny };
}

export function prepareVideoFrame(video, snapshot, { maxSide = MAX_SIDE } = {}) {
  const sourceW = video.videoWidth;
  const sourceH = video.videoHeight;
  if (!sourceW || !sourceH) {
    const error = new Error('VIDEO_NOT_READY');
    error.code = 'VIDEO_NOT_READY';
    throw error;
  }

  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  snapshot.width = width;
  snapshot.height = height;
  const context = snapshot.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return { width, height };
}

export function snapshotToBlob(snapshot, { type = 'image/jpeg', quality = 0.92 } = {}) {
  return new Promise((resolve, reject) => {
    snapshot.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('EMPTY_FRAME'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export function cropVideoRegion(source, bbox, { padX = 0.04, padY = 0.2, maxSide = 720 } = {}) {
  const vw = source.videoWidth || source.width;
  const vh = source.videoHeight || source.height;
  if (!vw || !vh) {
    const error = new Error('VIDEO_NOT_READY');
    error.code = 'VIDEO_NOT_READY';
    throw error;
  }

  const x = Math.max(0, bbox.x - bbox.w * padX);
  const y = Math.max(0, bbox.y - bbox.h * padY);
  const w = Math.min(1 - x, bbox.w * (1 + padX * 2));
  const h = Math.min(1 - y, bbox.h * (1 + padY * 2));
  const sx = Math.floor(x * vw);
  const sy = Math.floor(y * vh);
  const sw = Math.max(8, Math.ceil(w * vw));
  const sh = Math.max(8, Math.ceil(h * vh));

  const targetW = Math.min(maxSide, Math.max(360, sw * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(32, Math.round(targetW));
  canvas.height = Math.max(24, Math.round((sh / sw) * canvas.width));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function scanMenuImage(blob, { menuId, crop = false } = {}) {
  const form = new FormData();
  form.append('image', blob, crop ? 'crop.jpg' : 'menu.jpg');
  if (menuId) form.append('menu_id', String(menuId));
  if (crop) form.append('crop', '1');

  const headers = {};
  const raw = sessionStorage.getItem('menulens.session');
  if (raw) {
    try {
      const user = JSON.parse(raw);
      if (user?.token) headers.Authorization = `Bearer ${user.token}`;
    } catch {
      /* sessão local ainda sem token */
    }
  }

  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const response = await fetch(`${base}/menus/scan`, {
    method: 'POST',
    body: form,
    headers,
    signal: timeoutSignal(crop ? 30000 : SCAN_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Falha ao ler o cardápio.');
    error.code = payload.error || 'SCAN_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}
