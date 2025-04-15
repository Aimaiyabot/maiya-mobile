import { NextResponse } from 'next/server';

// Export runtime config
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Keywords to skip AI art and use fallback
const layoutKeywords = ["infographic", "marketing", "poster", "layout", "checklist", 
  "steps", "template", "guide", "tutorial", "process", "workflow", "diagram",
  "chart", "graph", "comparison", "table", "list", "bullet", "point", "item",
  "section", "part", "chapter", "heading", "title", "subtitle", "caption",
  "dashboard", "report", "summary", "overview", "outline", "structure", "format",
  "style", "theme", "font", "typography", "content"];

function needsVisualFallback(prompt: string): boolean {
  const lower = prompt.toLowerCase();
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

  return `Create a highly aesthetic, ultra-detailed image of: ${userPrompt}. Visual Style: Use a ${visualStyle} approach. Focus on sharp details, smooth lighting, and realistic textures. Pixar/Disney-level rendering or studio-quality photography vibe. Background should be clean or complementary. No text or UI unless specifically requested. Avoid distortion, blurriness, or fake letters. Prioritize clean layout, clear lighting, smooth composition, and rich detail. The image should be creative, beautiful, and ready to use for content, branding, or visual storytelling.`;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured" },
      { status: 500 }
    );
  }

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return NextResponse.json(
        { error: "Prompt must be a string with at least 5 characters" },
        { status: 400 }
      );
    }

    if (needsVisualFallback(prompt)) {
      return NextResponse.json({
        fallback: true,
        message: "Babe, this one works better as a layout or HTML design. Want me to make a styled mockup or infographic instead? 💻✨"
      });
    }

    const finalPrompt = buildStyledPrompt(prompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error('No image URL received from OpenAI');
    }
    
    return NextResponse.json({ 
      imageUrl,
      success: true 
    });

  } catch (error: any) {
    console.error("Image generation failed:", error?.message || error);
    return NextResponse.json(
      { 
        error: "Image generation failed", 
        details: error?.message || "Unknown error",
        success: false
      },
      { status: 500 }
    );
  }
}
