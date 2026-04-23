import express from "express";
import {
  createGroup,
  getGroupMessages,
  getUserGroups,
} from "../controllers/groupController.js";

const router = express.Router();

// 🏘️ Create Group
router.post("/create", createGroup);

// 📜 Get Group Messages
router.get("/:groupId/messages", getGroupMessages);

// 👥 Get User Groups
router.get("/user/:userId", getUserGroups);

export default router;