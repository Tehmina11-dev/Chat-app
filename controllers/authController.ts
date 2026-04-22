import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../utils/db.js";
import type { User } from "../models/types.js";
import { io } from "../index.js";

// =====================
// GET ALL USERS
// =====================
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const result = await db.query<User>(
      "SELECT id, username, email FROM auth ORDER BY username ASC"
    );

    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error("GET USERS ERROR:", err);
    return res.status(500).json({
      error: "Failed to fetch users",
      message: err.message,
    });
  }
};

// =====================
// SIGNUP
// =====================
export const signup = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query<User>(
      "INSERT INTO auth (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword]
    );

    const newUser = result.rows[0];

if (!newUser) {
  return res.status(500).json({ error: "User creation failed" });
}

// safe after check
io.emit("new_user", {
  id: newUser.id,
  username: newUser.username,
});

    return res.status(201).json({
      message: "User created successfully",
      user: newUser,
    });
  } catch (err: any) {
    console.error("SIGNUP ERROR:", err);

    if (err.code === "23505") {
      return res.status(400).json({
        error: "Email or username already exists",
      });
    }

    return res.status(500).json({
      error: "Signup failed",
      message: err.message,
    });
  }
};

// =====================
// LOGIN (FIXED VERSION)
// =====================
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await db.query(
      "SELECT id, username, email, password FROM auth WHERE email = $1",
      [email]
    );
    

    console.log("DB USER RESULT:", result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    if (!user.password) {
      return res.status(500).json({ error: "Password missing in DB row" });
    }
    console.log("LOGIN BODY:", req.body);
console.log("USER FROM DB:", user);
console.log("PASSWORD FIELD:", user?.password);

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });

  } catch (err: any) {
  console.error("🔥 FULL LOGIN ERROR:", err);
  console.log("LOGIN REQUEST:", req.body);

  return res.status(500).json({
    error: "Login failed",
    message: err?.message,
    stack: err?.stack,
  });
}
};