import express from "express";
import {
  sendMessage,
  getChatHistory,
  deleteMessageForMe,
  deleteMessageForEveryone,
} from "../controllers/messageController.js";

const router = express.Router();

router.post("/send", sendMessage);
router.get("/history/:user1Id/:user2Id", getChatHistory);
router.put("/delete-for-me/:messageId", deleteMessageForMe);
router.put("/delete-for-everyone/:messageId", deleteMessageForEveryone);

export default router;