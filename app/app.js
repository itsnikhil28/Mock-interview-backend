import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "*",
  methods: ["GET,POST"],
  credentials: true
}));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "resumes",
    resource_type: "pdf",
    format: async (req, file) => file.mimetype.split("/")[1],
    public_id: (req, file) => Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
  },
});


const upload = multer({ storage });

const streamClient = new StreamClient(
  process.env.STREAM_API_KEY,
  process.env.STREAM_SECRET_KEY
);

app.get("/", (req, res) => {
  res.send("hello");
})

app.post("/api/getStreamToken", (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID required" });
  }

  const token = streamClient.createToken(userId);
  return res.status(200).json({ token });
});

app.post("/api/uploadResume", upload.single("resume"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    res.status(200).json({ message: "Upload successful", url: req.file.path });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));