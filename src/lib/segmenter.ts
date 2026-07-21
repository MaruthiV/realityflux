import { FilesetResolver, InteractiveSegmenter } from "@mediapipe/tasks-vision";
import { loadImage } from "@/lib/frames";

// keep the wasm version in lockstep with package.json
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

// matches --color-flux-accent in globals.css
const ACCENT = { r: 124, g: 247, b: 212 };

// selections outside this range mean the model grabbed nothing or everything
const MIN_COVERAGE = 0.002;
const MAX_COVERAGE = 0.95;

let segmenterPromise: Promise<InteractiveSegmenter> | null = null;

function getSegmenter(): Promise<InteractiveSegmenter> {
  segmenterPromise ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const create = (delegate: "GPU" | "CPU") =>
      InteractiveSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    try {
      return await create("GPU");
    } catch {
      return create("CPU");
    }
  })();
  return segmenterPromise;
}

// Kick off the wasm + model download early so the first tap doesn't stall.
export function warmUpSegmenter(): void {
  getSegmenter().catch(() => {
    segmenterPromise = null;
  });
}

export type SegmentResult = {
  // white-on-black mask sent to Gemini
  maskUrl: string;
  // accent-tinted transparent overlay shown to the user
  overlayUrl: string;
  coverage: number;
};

// Segments the object at a normalized (x, y) tap point in the frame.
export async function segmentAt(
  frameUrl: string,
  x: number,
  y: number
): Promise<SegmentResult | null> {
  const [segmenter, image] = await Promise.all([
    getSegmenter(),
    loadImage(frameUrl),
  ]);

  return new Promise((resolve) => {
    segmenter.segment(image, { keypoint: { x, y } }, (result) => {
      const mask = result.categoryMask;
      if (!mask) {
        resolve(null);
        return;
      }

      const { width, height } = mask;
      const data = mask.getAsUint8Array();
      // whatever class the tapped pixel got is "the object" — sidesteps polarity surprises
      const tapIndex =
        Math.round(y * (height - 1)) * width + Math.round(x * (width - 1));
      const objectValue = data[tapIndex];

      const maskPixels = new Uint8ClampedArray(width * height * 4);
      const overlayPixels = new Uint8ClampedArray(width * height * 4);
      let objectCount = 0;

      for (let i = 0; i < data.length; i++) {
        const isObject = data[i] === objectValue;
        const p = i * 4;
        const value = isObject ? 255 : 0;
        maskPixels[p] = maskPixels[p + 1] = maskPixels[p + 2] = value;
        maskPixels[p + 3] = 255;
        if (isObject) {
          objectCount++;
          overlayPixels[p] = ACCENT.r;
          overlayPixels[p + 1] = ACCENT.g;
          overlayPixels[p + 2] = ACCENT.b;
          overlayPixels[p + 3] = 115;
        }
      }

      const coverage = objectCount / (width * height);
      if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
        resolve(null);
        return;
      }

      resolve({
        maskUrl: pixelsToDataUrl(maskPixels, width, height),
        overlayUrl: pixelsToDataUrl(overlayPixels, width, height),
        coverage,
      });
    });
  });
}

function pixelsToDataUrl(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}
