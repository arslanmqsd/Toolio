import { serveWorkerTask } from "@/lib/worker-task";
import { imagesToPdf, type EmbeddableType, type ImagesProgress, type PageOptions } from "./images-to-pdf";

export interface ImagesToPdfRequest {
  images: { bytes: ArrayBuffer; type: EmbeddableType }[];
  options: PageOptions;
}

// Off the main thread: decoding big PNGs and writing the PDF would freeze the page.
serveWorkerTask<ImagesToPdfRequest, ImagesProgress, Uint8Array>(({ images, options }, onProgress) =>
  imagesToPdf(images.map((image) => ({ bytes: new Uint8Array(image.bytes), type: image.type })), options, onProgress),
);
