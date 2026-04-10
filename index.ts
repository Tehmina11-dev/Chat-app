import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import { db } from "./utils/db.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Chat backend running");
});

// 👥 ONLINE USERS TRACKING
const userSockets = new Map<number, Set<string>>();

io.on("connection", (socket: Socket) => {
  console.log("Connected:", socket.id);

  // 👤 JOIN USER
  socket.on("join", (userId: number) => {
    socket.data.userId = userId;

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }

    userSockets.get(userId)!.add(socket.id);

    console.log(`User ${userId} is online`);

    // 👇 send full online list ONLY to this user
    const onlineUsers = Array.from(userSockets.keys());
    socket.emit("active_users", onlineUsers);

    // 👇 notify others
    socket.broadcast.emit("user_status", {
      userId,
      online: true,
    });
  });

  // 💬 SEND MESSAGE (TEXT + FILE + AUDIO)
  socket.on("send_message", async (data: any) => {
    const { sender_id, receiver_id, message_text, file_url, audio_url } =
      data;

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

      const savedMessage = result.rows[0];

      const receiverSockets = userSockets.get(receiver_id);

      if (receiverSockets) {
        receiverSockets.forEach((id) => {
          io.to(id).emit("receive_message", savedMessage);
        });
      }
    } catch (err) {
      console.error("Socket message error:", err);
    }
  });

  // ❌ DISCONNECT (FIXED LOGIC)
  socket.on("disconnect", () => {
    const userId = socket.data.userId;

    if (userId && userSockets.has(userId)) {
      const sockets = userSockets.get(userId)!;

      sockets.delete(socket.id);

      // 👇 ONLY remove user if no sockets left
      if (sockets.size === 0) {
        userSockets.delete(userId);

        console.log(`User ${userId} went offline`);

        socket.broadcast.emit("user_status", {
          userId,
          online: false,
        });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log("Server running on port", PORT)
);

export { io };