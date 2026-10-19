export function createMenuEnhancer() {
  const worker = new Worker(new URL('../workers/menuEnhance.worker.js', import.meta.url), {
    type: 'module',
  });
  let seq = 0;
  const pending = new Map();

  worker.onmessage = (event) => {
    const { id, width, height, buffer, error } = event.data;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    if (error || !buffer) {
      resolve(null);
      return;
    }
    resolve(new ImageData(new Uint8ClampedArray(buffer), width, height));
  };

  worker.onerror = () => {
    pending.forEach((resolve) => resolve(null));
    pending.clear();
  };

  return {
    async enhance(imageData, timeoutMs = 12000) {
      const id = (seq += 1);
      const copy = new Uint8ClampedArray(imageData.data);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve(null);
          }
        }, timeoutMs);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        worker.postMessage(
          { id, width: imageData.width, height: imageData.height, buffer: copy.buffer },
          [copy.buffer],
        );
      });
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
