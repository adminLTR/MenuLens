export function createMenuDetector() {
  const worker = new Worker(new URL('../workers/menuDetect.worker.js', import.meta.url), {
    type: 'module',
  });
  let seq = 0;
  const pending = new Map();

  worker.onmessage = (event) => {
    const { id, corners } = event.data;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(corners);
  };

  worker.onerror = () => {
    pending.forEach((resolve) => resolve(null));
    pending.clear();
  };

  return {
    async detect(bitmap, point, timeoutMs = 2500) {
      const id = (seq += 1);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve(null);
          }
        }, timeoutMs);
        pending.set(id, (corners) => {
          clearTimeout(timer);
          resolve(corners);
        });
        try {
          worker.postMessage({ id, bitmap, point }, [bitmap]);
        } catch {
          worker.postMessage({ id, bitmap, point });
        }
      });
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
