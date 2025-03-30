import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "*",
  methods: ["GET,POST"],
  credentials: true
}));

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "resumes",
    resource_type: "auto",
    public_id: (req, file) => Date.now() + "-" + file.originalname,
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
    res.status(500).json({ message: "Upload Unsuccessful", error: error.message });
  }
});

app.post("/api/send-invite-email", async (req, res) => {
  // return res.status(400).json({ success: false, message: req.body });

  const { recipients, meetingId, meetingUrl } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, message: "Recipients array is invalid or empty" });
  }

  if (!meetingId || typeof meetingId !== "string") {
    return res.status(400).json({ success: false, message: "Invalid or missing meetingId" });
  }

  if (!meetingUrl || typeof meetingUrl !== "string") {
    return res.status(400).json({ success: false, message: "Invalid or missing meetingUrl" });
  }

  try {
    // Read the email template
    let template = fs.readFileSync(path.join(__dirname, "templates/meetingInvite.html"), "utf-8");

    for (const recipient of recipients) {
      const { name, email } = recipient;

      if (!email || !name) continue;

      let personalizedTemplate = template
        .replace(/{{name}}/g, name)
        .replace(/{{meetingId}}/g, meetingId)
        .replace(/{{meetingUrl}}/g, meetingUrl);

      const mailOptions = {
        from: `"Interview Pilot" ${process.env.MAIL_USERNAME}`,
        to: email,
        subject: "You're Invited to a Meeting!",
        html: personalizedTemplate,
      };

      await transporter.sendMail(mailOptions);
    }

    return res.status(200).json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ success: false, message: "Failed to send emails." });
  }
});

app.post("/api/send-scheduled-email", async (req, res) => {
  const { title, description, startTime, meetingUrl, user, interviewers } = req.body;

  if (!title || !description || !startTime || !user || !interviewers || !Array.isArray(interviewers)) {
    return res.status(400).json({ success: false, message: "Invalid or missing required fields" });
  }

  try {
    // Load email templates
    let templateForCandidate = fs.readFileSync(path.join(__dirname, "templates/scheduledmeetingforcandidate.html"), "utf-8");
    let templateForInterviewer = fs.readFileSync(path.join(__dirname, "templates/scheduledmeetingforinterviewer.html"), "utf-8");

    // Format meeting time
    const meetingTime = new Date(startTime).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short",
    });

    if (user.email && user.name) {
      let candidateTemplate = templateForCandidate
        .replace(/{{name}}/g, user.name)
        .replace(/{{title}}/g, title)
        .replace(/{{description}}/g, description)
        .replace(/{{startTime}}/g, meetingTime)
        .replace(/{{meetingUrl}}/g, meetingUrl)
        .replace(/{{interviewers}}/g, interviewers.map(i => i.name).join(", "))

      await transporter.sendMail({
        from: `"Interview Pilot" ${process.env.MAIL_USERNAME}`,
        to: user.email,
        subject: `You're Invited to an Interview: ${title}`,
        html: candidateTemplate,
      });
    }

    // Send emails to interviewers
    for (const interviewer of interviewers) {
      if (!interviewer.email || !interviewer.name) continue;

      let interviewerTemplate = templateForInterviewer
        .replace(/{{name}}/g, interviewer.name)
        .replace(/{{candidateName}}/g, user.name)
        .replace(/{{title}}/g, title)
        .replace(/{{description}}/g, description)
        .replace(/{{startTime}}/g, meetingTime)
        .replace(/{{meetingUrl}}/g, meetingUrl)
        .replace(/{{interviewers}}/g, interviewers.map(i => i.name).join(", "));

      await transporter.sendMail({
        from: `"Interview Pilot" ${process.env.MAIL_USERNAME}`,
        to: interviewer.email,
        subject: `You Are Assigned as an Interviewer for: ${title}`,
        html: interviewerTemplate,
      });
    }

    return res.status(200).json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ success: false, message: "Failed to send emails." });
  }
});

app.post("/api/send-interviewer-request-email", async (req, res) => {
  const { company, experience, linkedin, message, user, document } = req.body;

  if (!company || !experience || !linkedin || !message || !user || !user.email || !user.name) {
    return res.status(400).json({ success: false, message: "Invalid or missing required fields" });
  }

  try {
    // Load email templates
    let templateForUser = fs.readFileSync(path.join(__dirname, "templates/interviewerRequestForUser.html"), "utf-8");
    let templateForAdmin = fs.readFileSync(path.join(__dirname, "templates/interviewerRequestForAdmin.html"), "utf-8");

    let userTemplate = templateForUser
      .replace(/{{name}}/g, user.name)
      .replace(/{{company}}/g, company)
      .replace(/{{experience}}/g, experience)
      .replace(/{{linkedin}}/g, linkedin)
      .replace(/{{message}}/g, message);

    await transporter.sendMail({
      from: `"Interview Pilot" <${process.env.MAIL_USERNAME}>`,
      to: user.email,
      subject: "Your Interviewer Request is Received",
      html: userTemplate,
    });

    let adminTemplate = templateForAdmin
      .replace(/{{candidateName}}/g, user.name)
      .replace(/{{candidateEmail}}/g, user.email)
      .replace(/{{company}}/g, company)
      .replace(/{{experience}}/g, experience)
      .replace(/{{linkedin}}/g, linkedin)
      .replace(/{{message}}/g, message)
      .replace(/{{documenturl}}/g, document)

    await transporter.sendMail({
      from: `"Interview Pilot" <${process.env.MAIL_USERNAME}>`,
      to: "kumarnikhil24077@gmail.com",
      subject: "New Interviewer Request Received",
      html: adminTemplate,
    });

    return res.status(200).json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ success: false, message: "Failed to send emails." });
  }
});



const PORT = 5000;
app.listen(PORT, () => console.log(`Server 1 running on port ${PORT}`));