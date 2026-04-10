import type { Request, Response } from "express";
import { db } from "../utils/db.js";

// 💬 SEND MESSAGE
export const sendMessage = async (req: Request, res: Response) => {
  const {
    sender_id,
    receiver_id,
    message_text,
    file_url,
    audio_url,
  } = req.body;

  // ✅ strict validation
  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await db.query(
      `INSERT INTO messages 
      (sender_id, receiver_id, message_text, file_url, audio_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        sender_id,
        receiver_id,
        message_text || null,
        file_url || null,
        audio_url || null,
      ]
    );

    return res.status(201).json({
      message: "Message sent",
      data: result.rows[0],
    });
  } catch (err: any) {
    console.error("Send Message Error:", err);

    return res.status(500).json({
      error: "Send message failed",
      details: err.message,
    });
  }
};

// 📜 CHAT HISTORY (WITH SAFE NULL HANDLING)
export const getChatHistory = async (req: Request, res: Response) => {
  const { user1Id, user2Id } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM messages
       WHERE deleted_for_everyone = FALSE
       AND (
         (sender_id = $1 AND receiver_id = $2 AND deleted_for_sender = FALSE)
         OR
         (sender_id = $2 AND receiver_id = $1 AND deleted_for_receiver = FALSE)
       )
       ORDER BY created_at ASC`,
      [user1Id, user2Id]
    );

    return res.json(result.rows);
  } catch (err: any) {
    console.error("History Error:", err);

    return res.status(500).json({
      error: "Failed to fetch chat history",
      details: err.message,
    });
  }
};

// 🗑️ DELETE MESSAGE (WHATSAPP STYLE)
export const deleteMessage = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, type } = req.body;

  if (!id || !userId || !type) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const msgRes = await db.query(
      "SELECT * FROM messages WHERE id = $1",
      [id]
    );

    const message = msgRes.rows[0];

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // 👥 DELETE FOR EVERYONE
    if (type === "everyone") {
      await db.query(
        `UPDATE messages
         SET deleted_for_everyone = TRUE
         WHERE id = $1`,
        [id]
      );

      return res.json({ message: "Deleted for everyone" });
    }

    // 👤 DELETE FOR ME
    if (type === "me") {
      if (message.sender_id === userId) {
        await db.query(
          `UPDATE messages
           SET deleted_for_sender = TRUE
           WHERE id = $1`,
          [id]
        );
      } else {
        await db.query(
          `UPDATE messages
           SET deleted_for_receiver = TRUE
           WHERE id = $1`,
          [id]
        );
      }

      return res.json({ message: "Deleted for you" });
    }

    return res.status(400).json({ error: "Invalid delete type" });
  } catch (err: any) {
    console.error("Delete Error:", err);

    return res.status(500).json({
      error: "Delete failed",
      details: err.message,
    });
  }
};