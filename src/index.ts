import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { config } from "./config";

import {
  login,
  changePassword,
  logout,
  getOnlineUsers,
} from "./controllers/authController";
import {
  generateToken,
  muteAllParticipants,
  unmuteAllParticipants,
  logoutAllParticipants,
  logoutUser,
  startPrivateVoice,
  stopPrivateVoice,
  reapplyPrivateVoice,
} from "./controllers/roomController";
import {
  uploadUserClip,
  getUserRecordings,
  getSessionRecordings,
  getMyRecordings,
  getRecordings,
  egressWebhook,
} from "./controllers/recordingsController";
import {
  startContinuousRecording,
  stopContinuousRecording,
  markClip,
} from "./controllers/continuousRecordingController";
import { initCleanupJob, triggerCleanup } from "./utils/cleanupJob";

const app = express();

// Trust proxy - Required when behind Nginx/Caddy reverse proxy
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================
const upload = multer({
  dest: path.join(config.recordings.storagePath, "temp"),
  limits: {
    fileSize: config.recordings.maxFileSize,
  },
});

// ==========================================
// STATIC FILE SERVING FOR RECORDINGS
// ==========================================
// Serve recording files - uses /recording-files/ prefix to avoid
// route conflict with the /recordings API endpoint
app.use("/recording-files", express.static(config.recordings.storagePath));

// Also keep the old /recordings static path for backward compat
// (mobile app may reference /recordings/sessions/... or /recordings/clips/...)
// This ONLY serves actual files with extensions, not the API path
app.use("/recordings", (req, res, next) => {
  // If this looks like an API request (no file extension), skip to the API route
  const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(req.path);
  if (!hasFileExtension) {
    return next();
  }
  express.static(config.recordings.storagePath)(req, res, next);
});

// ==========================================
// RATE LIMITING - Protect against brute force
// ==========================================

// Global rate limit: 5000 requests per 15 minutes per IP (to accommodate app polling)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for login: 30 attempts per 5 minutes per USERNAME
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: "Too many login attempts. Please try again in 5 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.body?.username || req.ip,
});

// Strict rate limit for password change: 3 attempts per hour
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    error: "Too many password change attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global rate limiting to all routes
app.use(globalLimiter);

// ==========================================
// ROUTES
// ==========================================

// Health check endpoints
app.get("/", (req, res) => {
  res.send("D Telecom Backend is running under v2");
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Auth routes
app.post("/login", loginLimiter, login);
app.post("/logout", logout);
app.post("/change-password", passwordChangeLimiter, changePassword);
app.get("/online-users", getOnlineUsers);

// Room routes
app.post("/token", generateToken);
app.post("/mute-all", muteAllParticipants);
app.post("/unmute-all", unmuteAllParticipants);
app.post("/logout-all", logoutAllParticipants);
app.post("/logout-user", logoutUser);
app.post("/private-voice/start", startPrivateVoice);
app.post("/private-voice/stop", stopPrivateVoice);
// Idempotent: admin client POSTs this whenever a user joins mid-1-1 so the
// newcomer inherits canSubscribe:false. No-op if the room has no active state.
app.post("/private-voice/reapply", reapplyPrivateVoice);

// Recording routes - Continuous room recording (instant push-to-talk).
// One Egress per room runs for the whole session; each press is sliced into a
// clip by a background job. This replaces the old per-press Egress endpoints.
app.post("/continuous-recording/start", startContinuousRecording);
app.post("/continuous-recording/stop", stopContinuousRecording);
app.post("/continuous-recording/mark", markClip);

// Recording listing + client-side clip upload
app.post("/upload-clip", upload.single("audio"), uploadUserClip);
app.get("/session-recordings", getSessionRecordings);
app.get("/user-recordings", getUserRecordings);
app.get("/my-recordings", getMyRecordings);
app.get("/api/recordings", getRecordings);
// Legacy route (backward compat - works because static middleware
// above skips requests without file extensions)
app.get("/recordings", getRecordings);

// Webhook for LiveKit Egress events
app.post("/webhook/egress", egressWebhook);

// Manual cleanup trigger (for testing)
app.post("/trigger-cleanup", async (req, res) => {
  await triggerCleanup();
  res.json({ message: "Cleanup triggered" });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(
    "Rate limiting enabled: 5000 req/15min global, 30 login attempts/5min",
  );
  console.log(`Recordings storage: ${config.recordings.storagePath}`);
  console.log(`Recordings retention: ${config.recordings.retentionDays} days`);

  // Initialize cleanup job
  initCleanupJob();
});
