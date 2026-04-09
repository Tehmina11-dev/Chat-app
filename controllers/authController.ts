import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../utils/db.js';
import type { User } from '../models/types.js';

// 1. GET ALL USERS (Sidebar ke liye zaroori)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    // Hum sirf id, username aur email bhejenge (password nahi bhejte security ke liye)
    const result = await db.query<User>('SELECT id, username, email FROM auth ORDER BY username ASC');
    
    res.status(200).json(result.rows);
  } catch (err: any) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch users", message: err.message });
  }
};

// 2. SIGNUP
export const signup = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.query<User>(
      'INSERT INTO auth (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    res.status(201).json({
      message: "User created successfully",
      user: result.rows[0]
    });

  } catch (err: any) {
    console.error("DETAILED SIGNUP ERROR:", err);
    if (err.code === '23505') {
      return res.status(400).json({ error: "Email or username already exists" });
    }
    res.status(500).json({ error: "Signup failed", message: err.message });
  }
};

// 3. LOGIN
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await db.query<User>('SELECT * FROM auth WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET as string, 
      { expiresIn: '1d' }
    );

    res.json({ 
      message: "Login successful",
      token, 
      user: { id: user.id, username: user.username, email: user.email } 
    });

  } catch (err: any) {
    console.error("DETAILED LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed", message: err.message });
  }
};