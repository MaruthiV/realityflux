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

// The accumulated transformation: what was asked for, plus frames to chain from.
type Effect = {
  prompts: string[];
  anchor: string;
  latest: string;
};

type StreamToken = { active: boolean };

const STATUS_MESSAGES: Partial<Record<CameraStatus, string>> = {
  requesting: "Waiting for camera access…",
  denied: "Camera access was denied. Enable it in your browser settings and reload.",
  unavailable: "No camera available. RealityFlux needs one to work its magic.",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [effect, setEffect] = useState<Effect | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamCount, setStreamCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamToken = useRef<StreamToken>({ active: false });

  useEffect(() => {
    warmUpSegmenter();
    const token = streamToken.current;
    return () => {
      token.active = false;
    };
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
    if (!container || busy || segmenting || streaming) return;
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
    if (busy || streaming) return;
    const source = currentSource();
    if (!source) return;

    setBusy(true);
    try {
      const edited = await requestEdit(source, prompt, {
        mask: selection?.maskUrl,
        mode,
      });
      setResult(edited);
      setSelection(null);
      addShot(edited);
      // stacked edits accumulate; a fresh edit starts a new effect
      setEffect((prev) =>
        result && prev
          ? { ...prev, prompts: [...prev.prompts, prompt], latest: edited }
          : { prompts: [prompt], anchor: edited, latest: edited }
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const startStream = () => {
    if (!effect || streaming || status !== "active") return;
    const token: StreamToken = { active: true };
    streamToken.current = token;
    setStreaming(true);
    setStreamCount(0);
    void runStreamLoop(token, effect);
  };

  const stopStream = () => {
    streamToken.current.active = false;
    setStreaming(false);
  };

  // Serial loop: capture → re-apply the effect with chained references → repeat.
  const runStreamLoop = async (token: StreamToken, initial: Effect) => {
    const promptText = initial.prompts.join("; ");
    const anchor = initial.anchor;
    let latest = initial.latest;

    while (token.active) {
      const video = videoRef.current;
      const frame =
        video && video.readyState >= 2
          ? captureFrame(video, facing === "user")
          : null;
      if (!frame) break;

      try {
        const edited = await requestEdit(frame, promptText, {
          references: anchor === latest ? [anchor] : [anchor, latest],
        });
        if (!token.active) break;
        latest = edited;
        setResult(edited);
        setEffect((prev) => (prev ? { ...prev, latest: edited } : prev));
        setStreamCount((count) => count + 1);
      } catch (err) {
        if (token.active) {
          showError(err instanceof Error ? err.message : "Stream stopped.");
        }
        break;
      }
      // let the ui breathe between cycles
      await sleep(100);
    }

    token.active = false;
    setStreaming(false);
  };

  const backToLive = () => {
    stopStream();
    setSelection(null);
    setResult(null);
    setEffect(null);
  };

  const statusMessage = STATUS_MESSAGES[status];
  const frozenFrame = selection?.frame ?? result;
  const promptPlaceholder = selection
    ? mode === "edit"
      ? "Describe what this becomes…"
      : "Describe what appears here…"
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
        className={`object-cover ${facing === "user" ? "-scale-x-100" : ""} ${
          streaming
            ? "absolute bottom-44 right-4 z-20 h-36 w-28 rounded-xl border border-white/20 shadow-lg"
            : "h-full w-full"
        }`}
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
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold tracking-tight text-white drop-shadow">
          Reality<span className="text-flux-accent">Flux</span>
        </h1>
        <div className="flex items-center gap-2">
          {streaming && (
            <span className="flex items-center gap-1.5 rounded-full border border-red-400/40 bg-black/40 px-3 py-1.5 text-xs font-medium text-red-300 backdrop-blur-xl">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              LIVE · {streamCount}
            </span>
          )}
          {frozenFrame && !streaming && (
            <button
              onClick={backToLive}
              className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-medium text-white backdrop-blur-xl"
            >
              ● Live
            </button>
          )}
          <button
            onClick={flip}
            disabled={streaming}
            aria-label="Flip camera"
            className="rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-xl transition-transform active:scale-90 disabled:opacity-30"
          >
            <FlipIcon />
          </button>
        </div>
      </header>

      {error && (
        <div className="absolute inset-x-0 top-16 z-10 flex justify-center px-4">
          <p className="rounded-xl border border-red-400/30 bg-red-950/70 px-4 py-2 text-xs text-red-200 backdrop-blur-xl">
            {error}
          </p>
        </div>
      )}

      {/* bottom hud */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-4 pb-6">
        {shots.length > 0 && !streaming && (
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
              {mode === "edit"
                ? "Object locked — describe the change"
                : "Spot locked — describe what appears here"}
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
            disabled={(status !== "active" && !frozenFrame) || busy || streaming}
            busy={busy}
            placeholder={promptPlaceholder}
            onSubmit={runEdit}
          />
          {effect && !streaming && (
            <button
              onClick={startStream}
              disabled={status !== "active" || busy}
              aria-label="Go live with this effect"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-flux-accent bg-flux-accent/20 backdrop-blur-xl transition-transform active:scale-90 disabled:opacity-30"
            >
              <PlayIcon />
            </button>
          )}
          {streaming && (
            <button
              onClick={stopStream}
              aria-label="Stop live effect"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-red-400 bg-red-500/20 backdrop-blur-xl transition-transform active:scale-90"
            >
              <span className="h-5 w-5 rounded-sm bg-red-400" />
            </button>
          )}
          {!effect && !streaming && (
            <button
              onClick={takeShot}
              disabled={status !== "active" || busy}
              aria-label="Capture frame"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-white/80 bg-white/10 backdrop-blur-xl transition-transform active:scale-90 disabled:opacity-30"
            >
              <span className="h-10 w-10 rounded-full bg-white/90" />
            </button>
          )}
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

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#7cf7d4">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
