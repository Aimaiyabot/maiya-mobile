// app/api/generate-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || prompt.length < 10) {
      return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: "1024x1024",
        model: "dall-e-3",
      }),
    });

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      console.error("No image returned:", data);
      return NextResponse.json({ error: "No image returned" }, { status: 500 });
    }

    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: "Image generation failed", details: error.message }, { status: 500 });
  }
}
