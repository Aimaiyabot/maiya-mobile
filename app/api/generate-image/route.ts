import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Keywords to skip AI art and use fallback
function needsVisualFallback(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const layoutKeywords = [
    "infographic", "marketing", "poster", "layout", "checklist", 
    "steps", "template", "guide", "tutorial", "process", "workflow", "diagram",
    "chart", "graph", "comparison", "table", "list", "bullet", "point", "item",
    "section", "part", "chapter", "heading", "title", "subtitle", "caption",
    "dashboard", "report", "summary", "overview", "outline", "structure", "format",
    "style", "theme", "font", "typography", "content"
  ];
  return layoutKeywords.some(keyword => lower.includes(keyword));
}

// Enhanced prompt for high-end visuals
function buildStyledPrompt(userPrompt: string): string {
  let visualStyle = "photorealistic";

  const lowerPrompt = userPrompt.toLowerCase();

  if (lowerPrompt.includes("cartoon") || lowerPrompt.includes("anime")) {
    visualStyle = "anime/cartoon style";
  } else if (lowerPrompt.includes("3d") || lowerPrompt.includes("render")) {
    visualStyle = "3D render";
  } else if (lowerPrompt.includes("painting") || lowerPrompt.includes("artistic")) {
    visualStyle = "digital painting";
  } else if (lowerPrompt.includes("kawaii") || lowerPrompt.includes("cute")) {
    visualStyle = "kawaii/cute style";
  } else if (lowerPrompt.includes("fantasy") || lowerPrompt.includes("magical")) {
    visualStyle = "fantasy art";
  } else if (lowerPrompt.includes("product") || lowerPrompt.includes("mockup")) {
    visualStyle = "product mockup";
  }

  return `
Create a highly aesthetic, ultra-detailed image of: ${userPrompt}

Visual Style:
- Use a ${visualStyle} approach
- Focus on sharp details, smooth lighting, and realistic textures
- Pixar/Disney-level rendering or studio-quality photography vibe
- Background should be clean or complementary
- No text or UI unless specifically requested
- Avoid distortion, blurriness, or fake letters
- Prioritize clean layout, clear lighting, smooth composition, and rich detail
- The image should be creative, beautiful, and ready to use for content, branding, or visual storytelling
- The image should be a high-quality, professional-looking image
`;
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Prompt is too short or missing." }, { status: 400 });
    }

    if (needsVisualFallback(prompt)) {
      return NextResponse.json({
        fallback: true,
        message:
          "Babe, this one works better as a layout or HTML design. Want me to make a styled mockup or infographic instead? 💻✨",
      });
    }

    const finalPrompt = buildStyledPrompt(prompt);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = response.data[0]?.url;
    return NextResponse.json({ imageUrl });

  } catch (error: any) {
    console.error("❌ Image generation failed:", error.message || error);
    return NextResponse.json({ error: "Image generation failed.", details: error.message }, { status: 500 });
  }
}
