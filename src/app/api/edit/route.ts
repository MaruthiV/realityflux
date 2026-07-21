import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

const MODEL = "gemini-2.5-flash-image";
const DATA_URL_PATTERN = /^data:(image\/[a-z.+-]+);base64,(.+)$/;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

type InstructionContext = {
  masked: boolean;
  chained: boolean;
  fusion: boolean;
};

function buildInstruction(
  prompt: string,
  { masked, chained, fusion }: InstructionContext
): string {
  if (chained) {
    return [
      "The first image is the live camera frame to edit.",
      `The following image(s) show the same scene moments ago with this transformation already applied: ${prompt}.`,
      "Re-apply exactly the same transformation to the first image — same materials, colors, and added elements as the references —",
      "while following the first image's current geometry, lighting, and perspective.",
      "Output only the transformed frame.",
    ].join(" ");
  }
  if (fusion && masked) {
    return [
      "The first image is a photo; the second is a placement mask where white marks where new content goes.",
      `Add this into the masked region: ${prompt}.`,
      "Render it as a striking, dimensional element that physically belongs in the scene —",
      "correct scale, perspective, occlusion, shadows, and reflections for the scene's lighting.",
      "Reproduce everything outside the mask exactly as it appears in the photo.",
    ].join(" ");
  }
  if (fusion) {
    return [
      `Add to this photo: ${prompt}.`,
      "Insert the new element(s) as if they physically exist in the scene —",
      "correct scale, perspective, occlusion, shadows, and reflections for the scene's lighting.",
      "Render them with a striking, dimensional, photoreal quality.",
      "Keep the rest of the photo unchanged.",
    ].join(" ");
  }
  if (masked) {
    return [
      "The first image is a photo; the second is a selection mask where white marks the only region you may change.",
      `Apply this to the masked region: ${prompt}.`,
      "Blend the edit seamlessly with the photo's lighting, perspective, and grain.",
      "Reproduce everything outside the mask exactly as it appears in the photo.",
    ].join(" ");
  }
  return [
    `Edit this photo: ${prompt}.`,
    "Apply the change photorealistically, matching the original lighting, perspective, and grain.",
    "Keep everything not mentioned in the instruction unchanged.",
  ].join(" ");
}

export async function POST(req: NextRequest) {
  const ai = getClient();
  if (!ai) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set. Add it to .env.local and restart." },
      { status: 500 }
    );
  }

  let frame: unknown,
    prompt: unknown,
    mask: unknown,
    references: unknown,
    mode: unknown;
  try {
    ({ frame, prompt, mask, references, mode } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const frameMatch =
    typeof frame === "string" ? frame.match(DATA_URL_PATTERN) : null;
  if (!frameMatch || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "Expected a frame data URL and a non-empty prompt." },
      { status: 400 }
    );
  }
  const [, mimeType, data] = frameMatch;

  const maskMatch =
    typeof mask === "string" ? mask.match(DATA_URL_PATTERN) : null;
  if (mask != null && !maskMatch) {
    return NextResponse.json(
      { error: "Mask must be an image data URL." },
      { status: 400 }
    );
  }

  const referenceMatches = (Array.isArray(references) ? references : [])
    .slice(0, 2)
    .map((ref) => (typeof ref === "string" ? ref.match(DATA_URL_PATTERN) : null));
  if (referenceMatches.some((match) => !match)) {
    return NextResponse.json(
      { error: "References must be image data URLs." },
      { status: 400 }
    );
  }
  if (maskMatch && referenceMatches.length > 0) {
    return NextResponse.json(
      { error: "Provide either a mask or references, not both." },
      { status: 400 }
    );
  }

  const imageParts = [{ inlineData: { mimeType, data } }];
  if (maskMatch) {
    imageParts.push({
      inlineData: { mimeType: maskMatch[1], data: maskMatch[2] },
    });
  }
  for (const match of referenceMatches) {
    imageParts.push({ inlineData: { mimeType: match![1], data: match![2] } });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            ...imageParts,
            {
              text: buildInstruction(prompt.trim(), {
                masked: Boolean(maskMatch),
                chained: referenceMatches.length > 0,
                fusion: mode === "fusion",
              }),
            },
          ],
        },
      ],
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!image?.data) {
      const refusal = parts.find((part) => part.text)?.text;
      return NextResponse.json(
        { error: refusal ?? "The model returned no image." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      image: `data:${image.mimeType ?? "image/png"};base64,${image.data}`,
    });
  } catch (err) {
    console.error("Gemini edit failed:", err);
    return NextResponse.json(
      { error: "Image generation failed. Try again in a moment." },
      { status: 502 }
    );
  }
}
