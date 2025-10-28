(() => {
  if (typeof Promise !== 'undefined' && typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers() {
      let resolve;
      let reject;

      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      return { promise, resolve, reject };
    };
  }
})();

const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js';

if (typeof importScripts === 'function') {
  importScripts(workerUrl);
} else {
  // Safari module worker fallback
  (async () => {
    const response = await fetch(workerUrl);
    const scriptContent = await response.text();
    const blob = new Blob([scriptContent], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })().catch((err) => {
    throw new Error(`Unable to load pdf.js worker: ${err instanceof Error ? err.message : String(err)}`);
  });
}