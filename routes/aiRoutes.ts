import express from "express";
import { handleAiChat } from "../controllers/aiController.js";

const router = express.Router();

router.post("/chat", handleAiChat);

export default router;
