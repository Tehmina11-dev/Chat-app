import { Request, Response } from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const handleAiChat = async (req: Request, res: Response) => {
  const { prompt, userId } = req.body;
  
  // .env se key nikal kar clean karna
  const rawKey = process.env.OPENAI_API_KEY || "";
  const apiKey = rawKey.replace(/[\n\r]/g, "").trim();

  // 1. Initial Logs
  console.log("\n--- [AI START] ---");
  console.log("User ID:", userId);
  console.log("Prompt:", prompt);

  if (!prompt) {
    return res.status(400).json({ success: false, error: "Prompt is required" });
  }

  if (!apiKey || !apiKey.startsWith("gsk_")) {
    console.error("CRITICAL ERROR: Groq API Key missing or invalid in .env");
    return res.status(500).json({ success: false, error: "API Key Configuration Error" });
  }

  try {
    console.log("Step 2: Sending request to Groq...");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a helpful chat assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 8000 // 8 seconds timeout taake request hang na ho
      }
    );

    console.log("Step 3: Response received from Groq.");

    const aiText = response.data.choices[0]?.message?.content || "No response text found.";

    const aiMessage = {
      id: Date.now(),
      sender_id: 0, // AI ID
      receiver_id: userId,
      message_text: aiText,
      created_at: new Date().toISOString(),
    };

    console.log("Step 4: Sending data to frontend:", aiText.substring(0, 30) + "...");
    console.log("--- [AI END] ---\n");

    return res.status(200).json({
      success: true,
      data: aiMessage,
    });

  } catch (err: any) {
    console.error("\n--- [AI ERROR] ---");
    
    if (err.code === 'ECONNABORTED') {
      console.error("Error: Request Timed Out (Groq took too long)");
    } else if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    } else {
      console.error("Message:", err.message);
    }
    
    return res.status(500).json({
      success: false,
      error: "AI Service Failed",
      details: err.response?.data?.error?.message || err.message,
    });
  }
};