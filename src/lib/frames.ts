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
