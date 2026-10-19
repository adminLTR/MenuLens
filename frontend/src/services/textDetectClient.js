export function createTextDetector() {
  const worker = new Worker(new URL('../workers/textDetect.worker.js', import.meta.url), {
    type: 'module',
  });
  let seq = 0;
  const pending = new Map();

  worker.onmessage = (event) => {
    const { id, boxes } = event.data;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(boxes || []);
  };

  worker.onerror = () => {
    pending.forEach((resolve) => resolve([]));
    pending.clear();
  };

  return {
    async detect(bitmap, point = null, timeoutMs = 2500) {
      const id = (seq += 1);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve([]);
          }
        }, timeoutMs);
        pending.set(id, (boxes) => {
          clearTimeout(timer);
          resolve(boxes);
        });
        try {
          worker.postMessage({ id, bitmap, point }, [bitmap]);
        } catch {
          worker.postMessage({ id, bitmap, point });
        }
      });
    },
    async detectAtPoint(bitmap, point, timeoutMs = 2500) {
      return this.detect(bitmap, point, timeoutMs);
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
