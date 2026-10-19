import { detectMenuQuad } from '../services/menuDetect.js';

self.onmessage = (event) => {
  const { id, bitmap, point } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = point ? detectMenuQuad(imageData, point.x, point.y) : null;
    self.postMessage({ id, corners: result?.corners || null });
  } catch (error) {
    self.postMessage({ id, corners: null, error: error.message });
  }
};
