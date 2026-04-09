import express from 'express';
import { sendMessage, getChatHistory } from '../controllers/messageController.js';

const router = express.Router();

router.post('/send', sendMessage);
router.get('/history/:user1Id/:user2Id', getChatHistory);

export default router;