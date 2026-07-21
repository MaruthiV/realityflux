import { useCallback, useEffect, useRef, useState } from "react";

export type CameraFacing = "environment" | "user";
export type CameraStatus = "requesting" | "active" | "denied" | "unavailable";

// Owns the getUserMedia stream lifecycle: start, flip, cleanup on unmount.
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("requesting");
  const [facing, setFacing] = useState<CameraFacing>("environment");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: CameraFacing) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      setStatus("requesting");
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            // play() can be interrupted by a quick camera flip; the new stream takes over
          });
        }
        setStatus("active");
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        setStatus(name === "NotAllowedError" ? "denied" : "unavailable");
      }
    },
    [stop]
  );

  const flip = useCallback(() => {
    setFacing((prev) => {
      const next: CameraFacing = prev === "environment" ? "user" : "environment";
      void start(next);
      return next;
    });
  }, [start]);

  useEffect(() => {
    void start("environment");
    return stop;
  }, [start, stop]);

  return { videoRef, status, facing, flip };
}
