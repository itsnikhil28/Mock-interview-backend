import express from "express";
import cors from "cors";
// import dotenv from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

// dotenv.config();

const app = express();
app.use(cors({
    origin:"*",
    methods:["GET,POST"],
    credentials:true
}));
app.use(express.json());

const streamClient = new StreamClient(
  process.env.STREAM_API_KEY,
  process.env.STREAM_SECRET_KEY
);

app.get("/",(req,res)=>{
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

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));