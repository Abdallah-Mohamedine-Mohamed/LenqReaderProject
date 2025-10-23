declare module 'pdfjs-dist/build/pdf' {
  export const GlobalWorkerOptions: {
    workerSrc: string | undefined;
  };

  export function getDocument(src: any): {
    promise: Promise<any>;
  };
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerSrc: string;
  export default workerSrc;
}
