import { detectLineAtPoint, detectTextLines } from '../services/textLines.js';

self.onmessage = (event) => {
  const { id, bitmap, point } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const boxes = point
      ? [detectLineAtPoint(imageData, point.x, point.y, { search: point.search || 0.04 })].filter(Boolean)
      : detectTextLines(imageData);
    self.postMessage({ id, boxes });
  } catch (error) {
    self.postMessage({ id, boxes: [], error: error.message });
  }
};
