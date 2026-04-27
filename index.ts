import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import { db } from "./utils/db.js";
import { testConnection, createChatSchema } from "./config/weaviate.js";

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
app.use("/api/groups", groupRoutes);
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
const groupSockets = new Map<number, Set<string>>();

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

  // 🏘️ JOIN GROUP
  socket.on("join_group", (groupId: number) => {
    socket.join(`group_${groupId}`);

    if (!groupSockets.has(groupId)) {
      groupSockets.set(groupId, new Set());
    }

    groupSockets.get(groupId)!.add(socket.id);
    console.log(`User ${socket.data.userId} joined group ${groupId}`);
  });

  // 🚪 LEAVE GROUP
  socket.on("leave_group", (groupId: number) => {
    socket.leave(`group_${groupId}`);

    const groupUsers = groupSockets.get(groupId);
    if (groupUsers) {
      groupUsers.delete(socket.id);
      if (groupUsers.size === 0) {
        groupSockets.delete(groupId);
      }
    }
    console.log(`User ${socket.data.userId} left group ${groupId}`);
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

  // 🏘️ SEND GROUP MESSAGE
  socket.on("send_group_message", async (data: any) => {
    const {
      sender_id,
      group_id,
      message_text,
      file_url,
      audio_url,
      file_type,
    } = data;

    try {
      const result = await db.query(
        `INSERT INTO messages 
        (sender_id, group_id, message_text, file_url, audio_url, file_type)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *`,
        [
          sender_id,
          group_id,
          message_text || null,
          file_url || null,
          audio_url || null,
          file_type || null,
        ]
      );

      const savedMessage = result.rows[0];

      // Get the message with sender_name
      const messageWithSender = await db.query(
        `SELECT m.*, u.username as sender_name
         FROM messages m
         JOIN auth u ON m.sender_id = u.id
         WHERE m.id = $1`,
        [savedMessage.id]
      );

      const fullMessage = messageWithSender.rows[0];

      console.log("✅ Group message saved to DB:", fullMessage);

      // 📤 Send to GROUP (excluding sender)
      socket.to(`group_${group_id}`).emit("receive_group_message", fullMessage);

      // 📤 Send back to SENDER
      socket.emit("group_message_sent", fullMessage);
    } catch (err) {
      console.error("Socket group message error:", err);
      socket.emit("group_message_error", { error: "Failed to send group message" });
    }
  });

  socket.on("delete_message", (data: any) => {
    const { messageId, senderId, receiverId } = data;
    const targetUserIds = new Set<number>([senderId, receiverId]);

    targetUserIds.forEach((userId) => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.forEach((socketId) => {
          io.to(socketId).emit("message_deleted", { messageId });
        });
      }
    });
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

    // Clean up group sockets
    for (const [groupId, sockets] of groupSockets.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          groupSockets.delete(groupId);
        }
      }
    }
  });

});

// =====================
// START APP FUNCTION
// =====================
const startApp = async () => {
  // Check if Weaviate is alive
  const isConnected = await testConnection();
  if (isConnected) {
    await createChatSchema(); // Ye sirf ek baar chalega agar schema nahi bana
  }

  // Baaki server start logic (Express, etc.)
  const PORT = process.env.PORT || 5000;

  httpServer.listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
};

// =====================
// START APPLICATION
// =====================
startApp().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});

export { io };