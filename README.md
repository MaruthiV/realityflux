# RealityFlux

Point your camera at the world and rewrite it.

RealityFlux streams your camera feed through Gemini 2.5 Flash Image (Nano Banana). Tap an object, type what you want it to become, and the model in-paints just that region — back in about two seconds, fast enough that the view feels alive. Successive frames get chained as references so lighting and perspective hold up even as you move. Fusion mode goes further and drops entirely new elements into the scene: a chrome panther on your desk, neon kanji hovering in the hallway.

This is a recreation of the [Nano Banana hackathon Overall Track winner](https://www.kaggle.com/competitions/banana/writeups/realityflux).

## How it works

- **Tap-to-edit** — a tap runs an on-device segmentation model (MediaPipe Interactive Segmenter) to mask the object you touched. The current frame, the mask, and your instruction go to Gemini 2.5 Flash Image as a masked in-paint request.
- **Frame chaining** — previous edited frames ride along as references, so the model keeps lighting and perspective consistent across the loop.
- **Fusion mode** — no mask, just imagination. The model composites brand-new, 3D-looking objects into the shot.

Everything runs in the browser except the model calls, which go through a thin server route so the API key never leaves the backend.

## Stack

Next.js + TypeScript + Tailwind on the front, `@google/genai` on the server hitting `gemini-2.5-flash-image`, MediaPipe for segmentation.

## Running it

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

Grab a key from [Google AI Studio](https://aistudio.google.com/apikey). Each frame edit is a real image generation call, so keep an eye on usage.

*(Demos, GIFs, and a walkthrough video are coming as the build progresses.)*
