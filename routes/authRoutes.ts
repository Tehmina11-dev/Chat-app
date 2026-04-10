import express from "express";
import { signup, login, getAllUsers } from "../controllers/authController.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/users", getAllUsers);

export default router;