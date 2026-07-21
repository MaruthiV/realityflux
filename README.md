# RealityFlux

Point your camera at the world and rewrite it.

RealityFlux streams your camera feed through Gemini 2.5 Flash Image. Tap an object, type what you want it to become, and the model in-paints just that region — back in about two seconds, fast enough that the view feels alive. Successive frames get chained as references so lighting and perspective hold up even as you move. Fusion mode goes further and drops entirely new elements into the scene: a chrome panther on your desk, neon signage floating in the hallway.

## How it works

- **Tap-to-edit** — a tap runs an on-device segmentation model (MediaPipe Interactive Segmenter) to mask the object you touched. The current frame, the mask, and your instruction go to Gemini as a masked in-paint request, so only that object changes.
- **Fusion mode** — no editing, pure imagination. The model composites brand-new, dimensional objects into the shot with matching scale, shadows, and reflections. Tap first to pick exactly where they land.
- **Go Live** — once you've applied an effect, hit play and RealityFlux re-applies it to fresh camera frames continuously. Previous edited frames ride along as references, so the transformation stays consistent while you pan around.
- **Prompt stacking** — edits layer on top of each other. Make the wall brick, then grow ivy on it, then set the ivy on fire. The whole stack streams live.

Everything runs in the browser except the model calls, which go through a thin server route so the API key never leaves the backend.

## Stack

Next.js + TypeScript + Tailwind on the front, `@google/genai` on the server hitting `gemini-2.5-flash-image`, MediaPipe for on-device segmentation.

## Running it

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

Grab a key from [Google AI Studio](https://aistudio.google.com/apikey). Heads up: every edit and every live-mode frame is a real image generation call (~$0.04 each), so the live loop can add up — there's a frame counter in the corner for exactly that reason.

*(Demos, GIFs, and a walkthrough video are coming as the build progresses.)*
