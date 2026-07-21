"use client";

import { useState } from "react";
import { useCamera, type CameraStatus } from "@/hooks/useCamera";
import { captureFrame } from "@/lib/frames";
import PromptBar from "@/components/PromptBar";

type Mode = "edit" | "fusion";

const STATUS_MESSAGES: Partial<Record<CameraStatus, string>> = {
  requesting: "Waiting for camera access…",
  denied: "Camera access was denied. Enable it in your browser settings and reload.",
  unavailable: "No camera available. RealityFlux needs one to work its magic.",
};

export default function FluxApp() {
  const { videoRef, status, facing, flip } = useCamera();
  const [mode, setMode] = useState<Mode>("edit");
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);

  const takeShot = () => {
    const video = videoRef.current;
    if (!video || status !== "active") return;
    const frame = captureFrame(video, facing === "user");
    if (!frame) return;
    setShots((prev) => [frame, ...prev].slice(0, 8));
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  };

  const statusMessage = STATUS_MESSAGES[status];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-flux-bg">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />

      {flash && <div className="absolute inset-0 bg-white/70" />}

      {statusMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-flux-bg/80 px-8 text-center">
          <p className="max-w-sm text-sm text-neutral-300">{statusMessage}</p>
        </div>
      )}

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold tracking-tight text-white drop-shadow">
          Reality<span className="text-flux-accent">Flux</span>
        </h1>
        <button
          onClick={flip}
          aria-label="Flip camera"
          className="rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-xl transition-transform active:scale-90"
        >
          <FlipIcon />
        </button>
      </header>

      {/* bottom hud */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        {shots.length > 0 && (
          <div className="flex w-full justify-end gap-1.5 overflow-x-auto">
            {shots.map((shot, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={shot}
                alt={`Captured frame ${i + 1}`}
                className="h-12 w-12 shrink-0 rounded-lg border border-white/15 object-cover"
              />
            ))}
          </div>
        )}

        <div className="flex rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-xl">
          {(["edit", "fusion"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-flux-accent text-black" : "text-neutral-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex w-full max-w-xl items-center gap-3">
          <PromptBar
            disabled={status !== "active"}
            placeholder={
              mode === "edit"
                ? "Describe what to change…"
                : "Describe what to summon…"
            }
            onSubmit={takeShot}
          />
          <button
            onClick={takeShot}
            disabled={status !== "active"}
            aria-label="Capture frame"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-white/80 bg-white/10 backdrop-blur-xl transition-transform active:scale-90 disabled:opacity-30"
          >
            <span className="h-10 w-10 rounded-full bg-white/90" />
          </button>
        </div>
      </div>
    </main>
  );
}

function FlipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8v4h4" />
      <path d="M21 16v-4h-4" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}
