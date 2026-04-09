import type { Request } from 'express';

// 1. User Interface
export interface User {
  id: number;
  username: string;
  email: string;
  password?: string; // Optional because we don't always send password to frontend
  created_at?: Date;
}

// 2. Auth Request (For Middleware)
export interface AuthRequest extends Request {
  user?: { id: number };
}

// 3. Message Interface (Updated to match DB)
export interface ChatMessage {
  id?: number;              // Database generated
  sender_id: number;
  receiver_id: number;
  message_text: string;          // Database mein 'message' column hai
  created_at?: Date;        // Database generated timestamp
}