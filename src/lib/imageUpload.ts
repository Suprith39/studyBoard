import type { ImageData } from '../types/board';

/** Convert a File to a base64 data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load an image and get its natural dimensions */
function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

const MAX_BOARD_WIDTH = 600;

/** Process an image file into an ImageData board item payload */
export async function processImageFile(
  file: File,
  dropX: number,
  dropY: number
): Promise<ImageData> {
  const src = await fileToDataUrl(file);
  const { width: ow, height: oh } = await loadImageDimensions(src);

  // Scale down if too wide
  const scale = ow > MAX_BOARD_WIDTH ? MAX_BOARD_WIDTH / ow : 1;
  const w = Math.round(ow * scale);
  const h = Math.round(oh * scale);

  return {
    x: dropX - w / 2,
    y: dropY - h / 2,
    width: w,
    height: h,
    src,
    originalWidth: ow,
    originalHeight: oh,
  };
}

/** Render the first page of a PDF and return an ImageData */
export async function processPdfFile(
  file: File,
  dropX: number,
  dropY: number
): Promise<ImageData[]> {
  // Dynamic import to keep bundle small
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: ImageData[] = [];

  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const src = canvas.toDataURL('image/png');
    const scale = viewport.width > MAX_BOARD_WIDTH ? MAX_BOARD_WIDTH / viewport.width : 1;
    const w = Math.round(viewport.width * scale);
    const h = Math.round(viewport.height * scale);

    results.push({
      x: dropX - w / 2 + (pageNum - 1) * 20,
      y: dropY - h / 2 + (pageNum - 1) * 20,
      width: w,
      height: h,
      src,
      originalWidth: viewport.width,
      originalHeight: viewport.height,
    });
  }

  return results;
}
