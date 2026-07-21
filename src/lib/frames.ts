// Gemini image I/O tops out around 1024px, so we downscale before sending.
const MAX_DIMENSION = 1024;

// Grabs the current video frame as a JPEG data URL, mirrored for the front camera.
export function captureFrame(
  video: HTMLVideoElement,
  mirror = false
): string | null {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(videoWidth, videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(videoWidth * scale);
  canvas.height = Math.round(videoHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode frame"));
    img.src = dataUrl;
  });
}

// Maps a screen tap to normalized frame coords, undoing the object-cover crop.
export function mapTapToNormalized(
  rect: DOMRect,
  sourceAspect: number,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rectAspect = rect.width / rect.height;
  let x: number;
  let y: number;
  if (rectAspect > sourceAspect) {
    // frame width fills the container, top/bottom are cropped
    x = (clientX - rect.left) / rect.width;
    const displayHeight = rect.width / sourceAspect;
    y = (clientY - rect.top + (displayHeight - rect.height) / 2) / displayHeight;
  } else {
    y = (clientY - rect.top) / rect.height;
    const displayWidth = rect.height * sourceAspect;
    x = (clientX - rect.left + (displayWidth - rect.width) / 2) / displayWidth;
  }
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
