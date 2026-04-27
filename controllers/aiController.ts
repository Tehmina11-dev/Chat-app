// import { Request, Response } from "express";
// import axios from "axios";
// import dotenv from "dotenv";

// dotenv.config();

// export const handleAiChat = async (req: Request, res: Response) => {
//   const { prompt, userId } = req.body;

//   // 🔑 Clean API key (Railway-safe)
//   const apiKey = (process.env.GROQ_API_KEY || "").trim();
//   console.log("🔥 RAW ENV:", process.env.GROQ_API_KEY);

//   console.log("\n--- [AI START] ---");
//   console.log("User ID:", userId);
//   console.log("Prompt:", prompt);
//   console.log("ENV KEY EXISTS:", !!apiKey);
//   console.log("KEY PREVIEW:", apiKey ? apiKey.slice(0, 6) : "NULL");

//   // ❌ Validate input
//   if (!prompt) {
//     return res.status(400).json({
//       success: false,
//       error: "Prompt is required",
//     });
//   }

//   // ❌ Validate API key
//   if (!apiKey) {
//     console.error("❌ GROQ API KEY MISSING IN RAILWAY ENV");
//     return res.status(500).json({
//       success: false,
//       error: "AI API key not configured",
//     });
//   }

//   try {
//     console.log("➡️ Calling Groq API...");

//     const response = await axios.post(
//       "https://api.groq.com/openai/v1/chat/completions",
//       {
//         model: "llama-3.1-8b-instant",
//         messages: [
//           {
//             role: "system",
//             content: "You are a helpful AI assistant inside a chat application.",
//           },
//           {
//             role: "user",
//             content: prompt,
//           },
//         ],
//         temperature: 0.7,
//         max_tokens: 1024,
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//         },
//         timeout: 15000,
//       }
//     );

//     console.log("✅ Groq response received");

//     // 🧠 Safe extraction
//     const aiText =
//       response.data?.choices?.[0]?.message?.content ||
//       "No response from AI.";

//     const aiMessage = {
//       id: Date.now(),
//       sender_id: 0,
//       receiver_id: userId,
//       message_text: aiText,
//       created_at: new Date().toISOString(),
//     };

//     return res.status(200).json({
//       success: true,
//       data: aiMessage,
//     });

//   } catch (err: any) {
//     console.error("\n❌ AI ERROR OCCURRED");

//     // 🔥 Better debug logs
//     if (err.response) {
//       console.error("STATUS:", err.response.status);
//       console.error("DATA:", err.response.data);
//     } else if (err.code === "ECONNABORTED") {
//       console.error("TIMEOUT ERROR");
//     } else {
//       console.error("MESSAGE:", err.message);
//     }

//     return res.status(500).json({
//       success: false,
//       error: "AI service failed",
//       details:
//         err.response?.data?.error?.message ||
//         err.message ||
//         "Unknown error",
//     });
//   }
// };


import { Request, Response } from "express";
import axios from "axios";
import dotenv from "dotenv";
import { db } from "../utils/db.js"; // Neon DB connection
import { getRelevantContext, saveMessageToMemory } from "../config/weaviate.js"; // Weaviate utilities

dotenv.config();

export const handleAiChat = async (req: Request, res: Response) => {
  const { prompt, userId, aiId } = req.body;

  const apiKey = (process.env.GROQ_API_KEY || "").trim();

  // 1. Validation
  if (!prompt || !userId) {
    return res.status(400).json({
      success: false,
      error: "Prompt and userId are required",
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "AI API key not configured",
    });
  }

  try {
    // --- STEP 1: Save User Message to Neon (Postgres) ---
    // Using userId for sender and aiId (defaulting to 0) for receiver
    await db.query(
      `INSERT INTO messages (sender_id, receiver_id, message_text) VALUES ($1, $2, $3)`,
      [userId, aiId || 0, prompt]
    );

    // --- STEP 2: Fetch Context from Weaviate (RAG) ---
    console.log("🔍 Fetching memory context from Weaviate...");
    let historyContext = "";
    try {
      // Pass userId and prompt to get relevant historical snippets
      historyContext = await getRelevantContext(userId.toString(), prompt);
    } catch (weaviateErr) {
      console.error("⚠️ Weaviate Retrieval Failed (continuing without memory):", weaviateErr);
      historyContext = "No previous context available due to a temporary search error.";
    }

    // --- STEP 3: Groq API Call ---
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are a professional and helpful chat assistant. 
            Use the following context from previous interactions to provide a personalized experience:
            ---
            ${historyContext || "No previous history found."}
            ---
            Focus on the user's current prompt but reference context if it helps answer accurately.`,
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

    const aiText = response.data?.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";

    // --- STEP 4: Save AI Reply to Neon ---
    const aiMsgResult = await db.query(
      `INSERT INTO messages (sender_id, receiver_id, message_text) VALUES ($1, $2, $3) RETURNING *`,
      [aiId || 0, userId, aiText]
    );

    // --- STEP 5: Sync to Weaviate Memory (Asynchronous) ---
    // We save both to build a "conversation memory" for next time
    saveMessageToMemory(userId.toString(), prompt, 'user')
      .catch(e => console.error("❌ Weaviate Save Error (User):", e));
      
    saveMessageToMemory(userId.toString(), aiText, 'assistant')
      .catch(e => console.error("❌ Weaviate Save Error (AI):", e));

    // --- STEP 6: Return Response to Frontend ---
    return res.status(200).json({
      success: true,
      data: {
        id: aiMsgResult.rows[0].id,
        sender_id: aiId || 0,
        receiver_id: userId,
        message_text: aiText,
        created_at: aiMsgResult.rows[0].created_at,
      },
    });

  } catch (err: any) {
    console.error("❌ AI ERROR:", err.message);
    return res.status(500).json({
      success: false,
      error: "AI service failed",
      details: err.response?.data?.error?.message || err.message,
    });
  }
};