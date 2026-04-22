import { Request, Response } from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const handleAiChat = async (req: Request, res: Response) => {
  const { prompt, userId } = req.body;

  // 🔑 Clean API key (Railway-safe)
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  console.log("🔥 RAW ENV:", process.env.GROQ_API_KEY);

  console.log("\n--- [AI START] ---");
  console.log("User ID:", userId);
  console.log("Prompt:", prompt);
  console.log("ENV KEY EXISTS:", !!apiKey);
  console.log("KEY PREVIEW:", apiKey ? apiKey.slice(0, 6) : "NULL");

  // ❌ Validate input
  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "Prompt is required",
    });
  }

  // ❌ Validate API key
  if (!apiKey) {
    console.error("❌ GROQ API KEY MISSING IN RAILWAY ENV");
    return res.status(500).json({
      success: false,
      error: "AI API key not configured",
    });
  }

  try {
    console.log("➡️ Calling Groq API...");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI assistant inside a chat application.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("✅ Groq response received");

    // 🧠 Safe extraction
    const aiText =
      response.data?.choices?.[0]?.message?.content ||
      "No response from AI.";

    const aiMessage = {
      id: Date.now(),
      sender_id: 0,
      receiver_id: userId,
      message_text: aiText,
      created_at: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      data: aiMessage,
    });

  } catch (err: any) {
    console.error("\n❌ AI ERROR OCCURRED");

    // 🔥 Better debug logs
    if (err.response) {
      console.error("STATUS:", err.response.status);
      console.error("DATA:", err.response.data);
    } else if (err.code === "ECONNABORTED") {
      console.error("TIMEOUT ERROR");
    } else {
      console.error("MESSAGE:", err.message);
    }

    return res.status(500).json({
      success: false,
      error: "AI service failed",
      details:
        err.response?.data?.error?.message ||
        err.message ||
        "Unknown error",
    });
  }
};