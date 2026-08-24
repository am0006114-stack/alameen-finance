"use client";

export type ImageOptimizationResult = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  optimized: boolean;
  reason: "optimized" | "already_small" | "unsupported" | "decode_failed" | "not_smaller";
};

const MAX_DIMENSION = 2000;
const TARGET_BYTES = 650 * 1024;
const KEEP_ORIGINAL_BELOW_BYTES = 420 * 1024;
const START_QUALITY = 0.84;
const MIN_QUALITY = 0.72;
const QUALITY_STEP = 0.04;

const OPTIMIZABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function replaceExtension(fileName: string, extension: string) {
  const clean = (fileName || "document-image").replace(/[^\w.\-]+/g, "-");
  const withoutExtension = clean.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "document-image"}.${extension}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("image_encode_failed"));
          return;
        }

        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function decodeImage(file: File) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });

      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to <img>; this covers browsers with partial bitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image_decode_failed"));
      element.src = objectUrl;
    });

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(image, 0, 0, width, height);
      },
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function formatUploadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function extensionForImageFile(file: File) {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/png") return "png";
  return "jpg";
}

export async function optimizeDocumentImage(
  file: File
): Promise<ImageOptimizationResult> {
  const originalBytes = file.size;

  if (!OPTIMIZABLE_TYPES.has(file.type)) {
    return {
      file,
      originalBytes,
      optimizedBytes: originalBytes,
      optimized: false,
      reason: "unsupported",
    };
  }

  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;

  try {
    decoded = await decodeImage(file);

    if (!decoded.width || !decoded.height) {
      throw new Error("invalid_dimensions");
    }

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(decoded.width, decoded.height)
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    if (
      scale === 1 &&
      originalBytes <= KEEP_ORIGINAL_BELOW_BYTES &&
      file.type !== "image/png"
    ) {
      return {
        file,
        originalBytes,
        optimizedBytes: originalBytes,
        optimized: false,
        reason: "already_small",
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("canvas_unavailable");
    }

    // Documents are easier to read on a white background, and this avoids
    // transparent PNGs becoming black when encoded to WebP.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    decoded.draw(context, width, height);

    let quality = START_QUALITY;
    let bestBlob: Blob | null = null;

    while (quality >= MIN_QUALITY - 0.001) {
      const blob = await canvasToBlob(canvas, "image/webp", quality);

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= TARGET_BYTES) {
        break;
      }

      quality = Number((quality - QUALITY_STEP).toFixed(2));
    }

    if (!bestBlob) {
      throw new Error("image_encode_failed");
    }

    // Never spend more storage for the sake of converting the format.
    if (bestBlob.size >= originalBytes) {
      return {
        file,
        originalBytes,
        optimizedBytes: originalBytes,
        optimized: false,
        reason: "not_smaller",
      };
    }

    const optimizedFile = new File(
      [bestBlob],
      replaceExtension(file.name, "webp"),
      {
        type: "image/webp",
        lastModified: file.lastModified || Date.now(),
      }
    );

    return {
      file: optimizedFile,
      originalBytes,
      optimizedBytes: optimizedFile.size,
      optimized: true,
      reason: "optimized",
    };
  } catch (error) {
    console.warn("Image optimization skipped; original file will be used.", error);

    return {
      file,
      originalBytes,
      optimizedBytes: originalBytes,
      optimized: false,
      reason: "decode_failed",
    };
  } finally {
    decoded?.close();
  }
}
