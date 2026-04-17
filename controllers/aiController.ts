import type { Request, Response } from "express";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const handleAiChat = async (req: Request, res: Response) => {
  const { prompt, userId } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "AI API key not configured" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
    });

    const aiText = response.choices[0]?.message?.content || "Sorry, I couldn't generate a reply.";

    const aiMessage = {
      id: Date.now(),
      sender_id: 0,
      receiver_id: userId,
      message_text: aiText,
      created_at: new Date().toISOString(),
    };

    return res.status(200).json({
      message: "AI response generated",
      data: aiMessage,
    });
  } catch (err: any) {
    console.error("AI Chat Error:", err);
    return res.status(500).json({
      error: "Failed to generate AI response",
      details: err.message || err,
    });
  }
};
