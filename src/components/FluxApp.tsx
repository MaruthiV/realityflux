"use client";

import { useEffect, useRef, useState } from "react";
import { useCamera, type CameraStatus } from "@/hooks/useCamera";
import { captureFrame, loadImage, mapTapToNormalized } from "@/lib/frames";
import { segmentAt, warmUpSegmenter } from "@/lib/segmenter";
import { requestEdit } from "@/lib/api";
import PromptBar from "@/components/PromptBar";

type Mode = "edit" | "fusion";

type Selection = {
  frame: string;
  maskUrl: string;
  overlayUrl: string;
};

const STATUS_MESSAGES: Partial<Record<CameraStatus, string>> = {
  requesting: "Waiting for camera access…",
  denied: "Camera access was denied. Enable it in your browser settings and reload.",
  unavailable: "No camera available. RealityFlux needs one to work its magic.",
};

export default function FluxApp() {
  const { videoRef, status, facing, flip } = useCamera();
  const viewRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    warmUpSegmenter();
  }, []);

  const showError = (message: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(message);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  };

  const addShot = (frame: string) => {
    setShots((prev) => [frame, ...prev].slice(0, 8));
  };

  // The frame everything operates on: a locked selection, an edit result, or a live capture.
  const currentSource = (): string | null => {
    if (selection) return selection.frame;
    if (result) return result;
    const video = videoRef.current;
    if (!video || status !== "active") return null;
    return captureFrame(video, facing === "user");
  };

  const takeShot = () => {
    const video = videoRef.current;
    if (!video || status !== "active") return;
    const frame = captureFrame(video, facing === "user");
    if (!frame) return;
    addShot(frame);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  };

  const handleTap = async (e: React.PointerEvent) => {
    const container = viewRef.current;
    if (!container || busy || segmenting) return;
    const source = currentSource();
    if (!source) return;

    setSegmenting(true);
    try {
      const image = await loadImage(source);
      const point = mapTapToNormalized(
        container.getBoundingClientRect(),
        image.naturalWidth / image.naturalHeight,
        e.clientX,
        e.clientY
      );
      const segment = await segmentAt(source, point.x, point.y);
      if (!segment) {
        showError("Couldn't isolate anything there — try another spot.");
        return;
      }
      setSelection({
        frame: source,
        maskUrl: segment.maskUrl,
        overlayUrl: segment.overlayUrl,
      });
    } catch {
      showError("Segmentation failed. Check your connection and try again.");
    } finally {
      setSegmenting(false);
    }
  };

  const runEdit = async (prompt: string) => {
    if (busy) return;
    const source = currentSource();
    if (!source) return;

    setBusy(true);
    try {
      const edited = await requestEdit(source, prompt, selection?.maskUrl);
      setResult(edited);
      setSelection(null);
      addShot(edited);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const backToLive = () => {
    setSelection(null);
    setResult(null);
  };

  const statusMessage = STATUS_MESSAGES[status];
  const frozenFrame = selection?.frame ?? result;
  const promptPlaceholder = selection
    ? "Describe what this becomes…"
    : mode === "edit"
      ? "Describe what to change…"
      : "Describe what to summon…";

  return (
    <main
      ref={viewRef}
      className="relative h-dvh w-full overflow-hidden bg-flux-bg"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />

      {frozenFrame && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frozenFrame}
          alt="Current frame"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {selection && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selection.overlayUrl}
          alt="Selected region"
          className="absolute inset-0 h-full w-full animate-pulse object-cover"
        />
      )}

      {/* tap layer: sits above the frame, below the hud */}
      <div className="absolute inset-0" onPointerUp={handleTap} />

      {busy && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-flux-accent/20 via-transparent to-flux-accent/10" />
      )}

      {flash && <div className="absolute inset-0 bg-white/70" />}

      {statusMessage && !frozenFrame && (
        <div className="absolute inset-0 flex items-center justify-center bg-flux-bg/80 px-8 text-center">
          <p className="max-w-sm text-sm text-neutral-300">{statusMessage}</p>
        </div>
      )}

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold tracking-tight text-white drop-shadow">
          Reality<span className="text-flux-accent">Flux</span>
        </h1>
        <div className="flex items-center gap-2">
          {frozenFrame && (
            <button
              onClick={backToLive}
              className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-medium text-white backdrop-blur-xl"
            >
              ● Live
            </button>
          )}
          <button
            onClick={flip}
            aria-label="Flip camera"
            className="rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-xl transition-transform active:scale-90"
          >
            <FlipIcon />
          </button>
        </div>
      </header>

      {error && (
        <div className="absolute inset-x-0 top-16 flex justify-center px-4">
          <p className="rounded-xl border border-red-400/30 bg-red-950/70 px-4 py-2 text-xs text-red-200 backdrop-blur-xl">
            {error}
          </p>
        </div>
      )}

      {/* bottom hud */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        {shots.length > 0 && (
          <div className="flex w-full justify-end gap-1.5 overflow-x-auto">
            {shots.map((shot, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={shot}
                alt={`Frame ${i + 1}`}
                className="h-12 w-12 shrink-0 rounded-lg border border-white/15 object-cover"
              />
            ))}
          </div>
        )}

        {segmenting && (
          <p className="rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-xs text-neutral-200 backdrop-blur-xl">
            Finding the object…
          </p>
        )}

        {selection && !segmenting && (
          <div className="flex items-center gap-2 rounded-full border border-flux-accent/40 bg-black/40 py-1.5 pl-4 pr-1.5 backdrop-blur-xl">
            <span className="text-xs text-flux-accent">
              Object locked — describe the change
            </span>
            <button
              onClick={() => setSelection(null)}
              aria-label="Clear selection"
              className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs text-white"
            >
              ✕
            </button>
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
            disabled={(status !== "active" && !frozenFrame) || busy}
            busy={busy}
            placeholder={promptPlaceholder}
            onSubmit={runEdit}
          />
          <button
            onClick={takeShot}
            disabled={status !== "active" || busy}
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
