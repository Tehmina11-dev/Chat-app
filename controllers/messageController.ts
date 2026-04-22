import type { Request, Response } from "express";
import { db } from "../utils/db.js";

// 💬 SEND MESSAGE (UPDATED WITH file_type)
export const sendMessage = async (req: Request, res: Response) => {
  const {
    sender_id,
    receiver_id,
    message_text,
    file_url,
    audio_url,
    file_type, // ✅ NEW FIELD
  } = req.body;

  // ✅ strict validation
  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await db.query(
      `INSERT INTO messages 
      (sender_id, receiver_id, message_text, file_url, audio_url, file_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        sender_id,
        receiver_id,
        message_text || null,
        file_url || null,
        audio_url || null,
        file_type || null, // ✅ NEW
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

// 📜 CHAT HISTORY (UNCHANGED)
export const getChatHistory = async (req: Request, res: Response) => {
  const { user1Id, user2Id } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM messages
       WHERE
         (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
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

export const deleteMessageForMe = async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { userId } = req.body;

  if (!messageId || !userId) {
    return res.status(400).json({ error: "Missing message ID or user ID" });
  }

  try {
    const existing = await db.query(
      `SELECT sender_id, receiver_id FROM messages WHERE id = $1`,
      [messageId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    const message = existing.rows[0];
    const numericUserId = Number(userId);

    if (message.sender_id !== numericUserId && message.receiver_id !== numericUserId) {
      return res.status(403).json({ error: "Not authorized to delete this message" });
    }

    await db.query(`DELETE FROM messages WHERE id = $1`, [messageId]);

    return res.json({
      message: "Message deleted for me",
      messageId: Number(messageId),
    });
  } catch (err: any) {
    console.error("Delete for me error:", err);
    return res.status(500).json({
      error: "Failed to delete message",
      details: err.message,
    });
  }
};

export const deleteMessageForEveryone = async (req: Request, res: Response) => {
  const { messageId } = req.params;

  if (!messageId) {
    return res.status(400).json({ error: "Missing message ID" });
  }

  try {
    const existing = await db.query(
      `SELECT sender_id, receiver_id FROM messages WHERE id = $1`,
      [messageId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    await db.query(`DELETE FROM messages WHERE id = $1`, [messageId]);

    return res.json({
      message: "Message deleted for everyone",
      messageId: Number(messageId),
    });
  } catch (err: any) {
    console.error("Delete for everyone error:", err);
    return res.status(500).json({
      error: "Failed to delete message",
      details: err.message,
    });
  }
};

