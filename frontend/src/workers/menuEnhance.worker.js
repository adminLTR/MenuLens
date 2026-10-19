import { enhanceMenuScan } from '../services/menuEnhance.js';

self.onmessage = (event) => {
  const { id, width, height, buffer } = event.data;
  try {
    const input = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const output = enhanceMenuScan(input);
    self.postMessage({ id, width, height, buffer: output.data.buffer }, [output.data.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
