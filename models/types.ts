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
  receiver_id?: number | null; // Optional for group messages
  group_id?: number | null; // For group messages
  message_text?: string;    // Database mein 'message' column hai
  file_url?: string | null; // For file attachments
  audio_url?: string | null; // For voice messages
  file_type?: string | null; // MIME type of file
  created_at?: Date;        // Database generated timestamp
}

// 4. Group Interface
export interface Group {
  id?: number;
  name: string;
  created_by: number;
  created_at?: Date;
}

// 5. Group Member Interface
export interface GroupMember {
  group_id: number;
  user_id: number;
  joined_at?: Date;
}