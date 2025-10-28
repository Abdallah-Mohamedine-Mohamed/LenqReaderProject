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

// Chargement du worker officiel pdf.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');

