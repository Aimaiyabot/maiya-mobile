import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { messages, name, niche } = await req.json();
    const todayKey = new Date().toISOString().split('T')[0];

    const personalizedIntro =
      name && niche
        ? `Their name is ${name} and they are in the ${niche} niche. Greet them casually using their name and occasionally reference their niche.`
        : '';

    const systemPrompt = `
You're Maiya 💖 — a cute, bubbly, and professional AI bestie who helps with:
- Digital marketing 📲
- Passive income tips 💸
- Ebooks, guides, content ideas 📚
- Branding and online growth 🌟

Your personality:
- Super friendly and encouraging 🌸
- Funny but still informative ✨
- Think Gen-Z meets marketing coach 💼💕

💾 Memory:
${personalizedIntro}

Rules:
1. Only greet the user ONCE at the start of a new convo.
2. Use their name and niche naturally, like "Hey ${name || '[name]'}, how’s your ${niche || '[niche]'} biz?"
3. Use lists with emojis. Be clear, cute, and motivational!

Example:
1. Pick a niche 🌿  
2. Validate your idea ✅  
3. Start outlining your ebook 📝

You are here to hype and help them like a business bestie! 🎀
    `.trim();

    // Generate reply
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.85,
    });

    const replyContent = chatResponse.choices[0].message.content;

    // Generate session summary
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `Summarize this chat session in 2-3 short sentences. Keep it friendly and include key points with emojis.` },
        ...messages,
      ],
      temperature: 0.7,
    });

    const summary = summaryResponse.choices[0].message.content;

    // Save summary to Supabase
    await supabase.from('summaries').upsert({
      date: todayKey,
      summery: summary,
    });

    return NextResponse.json({ reply: replyContent });
  } catch (error) {
    console.error('Maiya route error:', error);
    return NextResponse.json(
      { reply: "Oops! Something went wrong on my end 💔 Try again in a sec?" },
      { status: 500 }
    );
  }
}
