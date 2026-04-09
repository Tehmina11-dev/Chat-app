// index.ts
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import { db } from './utils/db.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// Simple root route to avoid "Cannot GET /"
app.get("/", (req: Request, res: Response) => {
  res.send("Backend is running. Use frontend for chat app.");
});

// --- Socket.IO Logic ---
const userSockets = new Map<number, Set<string>>(); // Map userId -> Set of socketIds

io.on('connection', (socket: Socket) => {
  console.log('User connected:', socket.id);

  // User joins with their ID
  socket.on('join', (userId: number) => {
    socket.data.userId = userId;

    // Store multiple sockets per user
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)?.add(socket.id);

    console.log(`User ${userId} online with socket: ${socket.id}`);

    // Send current online users list to this client
    socket.emit('active_users', Array.from(userSockets.keys()));

    // Notify other users that this user is online
    socket.broadcast.emit('user_status', { userId, online: true });
  });

  // Listen for messages from frontend
  socket.on('send_message', async (data: any) => {
    const { sender_id, receiver_id, message_text } = data;

    // Save message to database
    try {
      await db.query(
        'INSERT INTO messages (sender_id, receiver_id, message_text) VALUES ($1, $2, $3)',
        [sender_id, receiver_id, message_text]
      );
    } catch (err) {
      console.error('DB insert failed:', err);
    }

    // Send message to all sockets of receiver
    const receiverSockets = userSockets.get(receiver_id);
    if (receiverSockets) {
      receiverSockets.forEach((sockId) => {
        io.to(sockId).emit('receive_message', data);
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userId = socket.data.userId as number | undefined;
    if (userId && userSockets.has(userId)) {
      const sockets = userSockets.get(userId);
      sockets?.delete(socket.id);
      if (sockets?.size === 0) userSockets.delete(userId);

      console.log(`User ${userId} disconnected`);

      // Notify other users that this user went offline
      socket.broadcast.emit('user_status', { userId, online: false });
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));