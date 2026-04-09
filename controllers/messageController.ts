import type { Request, Response } from 'express';
import { db } from '../utils/db.js';
import type { ChatMessage } from '../models/types.js'; // ChatMessage type use kar rahe hain

// 1. Naya message bhejna aur save karna
export const sendMessage = async (req: Request, res: Response) => {
  // Database mein 'message_text' hai, isliye body se bhi wahi le rahe hain
  const { sender_id, receiver_id, message_text } = req.body;

  if (!sender_id || !receiver_id || !message_text) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await db.query<ChatMessage>(
      'INSERT INTO messages (sender_id, receiver_id, message_text) VALUES ($1, $2, $3) RETURNING *',
      [sender_id, receiver_id, message_text]
    );
    
    res.status(201).json({
      message: "Message sent successfully",
      data: result.rows[0]
    });
  } catch (err: any) {
    console.error("Message Send Error:", err);
    res.status(500).json({ 
      error: "Failed to send message", 
      details: err.message 
    });
  }
};

// 2. Do users ke darmiyan saari chat history hasil karna
export const getChatHistory = async (req: Request, res: Response) => {
  const { user1Id, user2Id } = req.params;

  try {
    const result = await db.query<ChatMessage>(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2) 
       OR (sender_id = $2 AND receiver_id = $1) 
       ORDER BY created_at ASC`,
      [user1Id, user2Id]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("Fetch History Error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
};