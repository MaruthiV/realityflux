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

function buildInstruction(prompt: string): string {
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

  let frame: unknown, prompt: unknown;
  try {
    ({ frame, prompt } = await req.json());
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: buildInstruction(prompt.trim()) },
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
