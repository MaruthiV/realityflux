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

function buildInstruction(prompt: string, masked: boolean): string {
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

  let frame: unknown, prompt: unknown, mask: unknown;
  try {
    ({ frame, prompt, mask } = await req.json());
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

  const imageParts = [{ inlineData: { mimeType, data } }];
  if (maskMatch) {
    imageParts.push({
      inlineData: { mimeType: maskMatch[1], data: maskMatch[2] },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            ...imageParts,
            { text: buildInstruction(prompt.trim(), Boolean(maskMatch)) },
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
