import express from "express";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/", upload.single("file"), (req: any, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileUrl = `http://localhost:5000/uploads/${file.filename}`;

  return res.json({
    file_url: fileUrl,
    file_type: file.mimetype,
  });
});

export default router;