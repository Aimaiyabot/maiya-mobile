import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt } = req.body;

  if (!prompt || prompt.length < 10) {
    return res.status(400).json({ error: "Invalid prompt" });
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = response.data[0].url; // ✅ safer access
    res.status(200).json({ imageUrl });
  } catch (error: any) {
    console.error("Image generation failed:", error);
    res.status(500).json({ error: "Image generation failed", details: error.message });
  }
}
