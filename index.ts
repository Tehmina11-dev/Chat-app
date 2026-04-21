import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import { db } from "./utils/db.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://chatfrontend-theta.vercel.app"
    ],
    credentials: true
  },
});

// =====================
// MIDDLEWARE
// =====================
app.use(cors({
  origin: [
    "http://localhost:3000",        // local frontend
    "https://chatfrontend-theta.vercel.app"// your deployed frontend (if any)
  ],
  credentials: true
}));
app.options("*", cors());
app.use(express.json());

// 📁 Serve uploaded files with proper headers for audio playback
app.use("/uploads", (req, res, next) => {
  const filePath = req.path;
  
  // Detect audio file type and set correct headers
  if (filePath.endsWith(".wav")) {
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", "inline; filename=\"voice.wav\"");
  } else if (filePath.endsWith(".mp3")) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", "inline; filename=\"voice.mp3\"");
  } else if (filePath.endsWith(".webm")) {
    res.setHeader("Content-Type", "audio/webm");
    res.setHeader("Content-Disposition", "inline; filename=\"voice.webm\"");
  } else if (filePath.endsWith(".ogg")) {
    res.setHeader("Content-Type", "audio/ogg");
    res.setHeader("Content-Disposition", "inline; filename=\"voice.ogg\"");
  }
  
  // Add cache headers
  res.setHeader("Cache-Control", "public, max-age=31536000");
  next();
}, express.static("uploads"));

// =====================
// ROUTES
// =====================
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/ai", aiRoutes);
app.use("/upload", uploadRoutes);

// =====================
// TEST ROUTE
// =====================
app.get("/", (req: Request, res: Response) => {
  res.send("Chat backend running");
});

// =====================
// ONLINE USERS
// =====================
const userSockets = new Map<number, Set<string>>();

// =====================
// SOCKET.IO
// =====================
io.on("connection", (socket: Socket) => {
  console.log("Connected:", socket.id);

  // 👤 JOIN
  socket.on("join", (userId: number) => {
    socket.data.userId = userId;

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }

    userSockets.get(userId)!.add(socket.id);

    const onlineUsers = Array.from(userSockets.keys());
    socket.emit("active_users", onlineUsers);

    socket.broadcast.emit("user_status", {
      userId,
      online: true,
    });
  });

  // 💬 SEND MESSAGE (FINAL FIXED)
  socket.on("send_message", async (data: any) => {
    const {
      sender_id,
      receiver_id,
      message_text,
      file_url,
      audio_url,
      file_type,
    } = data;

    try {
      const result = await db.query(
        `INSERT INTO messages 
        (sender_id, receiver_id, message_text, file_url, audio_url, file_type)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *`,
        [
          sender_id,
          receiver_id,
          message_text || null,
          file_url || null,
          audio_url || null,
          file_type || null,
        ]
      );

      const savedMessage = result.rows[0];

      console.log("✅ Message saved to DB:", savedMessage);

      // 📤 Send to RECEIVER
      const receiverSockets = userSockets.get(receiver_id);
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("receive_message", savedMessage);
        });
      }

      // 📤 Send back to SENDER (so they get the DB ID)
      const senderSockets = userSockets.get(sender_id);
      if (senderSockets) {
        senderSockets.forEach((socketId) => {
          io.to(socketId).emit("message_sent", savedMessage);
        });
      }
    } catch (err) {
      console.error("Socket message error:", err);
    }
  });

  // ❌ DISCONNECT
  socket.on("disconnect", () => {
    const userId = socket.data.userId;

    if (userId && userSockets.has(userId)) {
      const sockets = userSockets.get(userId)!;

      sockets.delete(socket.id);

      if (sockets.size === 0) {
        userSockets.delete(userId);

        socket.broadcast.emit("user_status", {
          userId,
          online: false,
        });
      }
    }
  });

  // 🗑️ DELETE MESSAGE (REAL-TIME VIA SOCKET)
  socket.on("delete_message", async (data: any) => {
    const { messageId, userId, type, sender_id, receiver_id } = data;

    try {
      // Update database based on deletion type
      if (type === "everyone") {
        await db.query(
          `UPDATE messages SET deleted_for_everyone = TRUE WHERE id = $1`,
          [messageId]
        );
      } else if (type === "me") {
        if (userId === sender_id) {
          await db.query(
            `UPDATE messages SET deleted_for_sender = TRUE WHERE id = $1`,
            [messageId]
          );
        } else {
          await db.query(
            `UPDATE messages SET deleted_for_receiver = TRUE WHERE id = $1`,
            [messageId]
          );
        }
      }

      // Get updated message
      const result = await db.query("SELECT * FROM messages WHERE id = $1", [
        messageId,
      ]);
      const updatedMessage = result.rows[0];

      // Broadcast to both sender and receiver
      const senderSockets = userSockets.get(sender_id);
      if (senderSockets) {
        senderSockets.forEach((socketId) => {
          io.to(socketId).emit("message_deleted", updatedMessage);
        });
      }

      const receiverSockets = userSockets.get(receiver_id);
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("message_deleted", updatedMessage);
        });
      }

      console.log("✅ Message deleted:", messageId);
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

export { io };