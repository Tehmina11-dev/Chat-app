import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { db } from "./utils/db.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// =====================
// MIDDLEWARE
// =====================
app.use(cors());
app.use(express.json());

// 📁 Serve uploaded files
app.use("/uploads", express.static("uploads"));

// =====================
// ROUTES
// =====================
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
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

      const receiverSockets = userSockets.get(receiver_id);

      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("receive_message", savedMessage);
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
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

export { io };