import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { config } from './config';

import { login, changePassword, logout, getOnlineUsers } from './controllers/authController';
import { generateToken, muteAllParticipants, unmuteAllParticipants, logoutAllParticipants, logoutUser } from './controllers/roomController';
import {
    startSessionRecording,
    stopSessionRecording,
    uploadUserClip,
    getUserRecordings,
    getSessionRecordings,
    getMyRecordings,
    getRecordings,
    egressWebhook,
    // Legacy aliases
    startRecording,
    stopRecording
} from './controllers/recordingsController';
import { initCleanupJob, triggerCleanup } from './utils/cleanupJob';

const app = express();

// Trust proxy - Required when behind Nginx/Caddy reverse proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================
const upload = multer({
    dest: path.join(config.recordings.storagePath, 'temp'),
    limits: {
        fileSize: config.recordings.maxFileSize
    }
});

// ==========================================
// STATIC FILE SERVING FOR RECORDINGS
// ==========================================
app.use('/recordings', express.static(config.recordings.storagePath));

// ==========================================
// RATE LIMITING - Protect against brute force
// ==========================================

// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict rate limit for login: 10 attempts per 15 minutes per USERNAME
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => req.body?.username || req.ip,
});

// Strict rate limit for password change: 3 attempts per hour
const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Too many password change attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply global rate limiting to all routes
app.use(globalLimiter);

// ==========================================
// ROUTES
// ==========================================

// Health check endpoints
app.get('/', (req, res) => {
    res.send('D Telecom Backend is running');
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Auth routes
app.post('/login', loginLimiter, login);
app.post('/logout', logout);
app.post('/change-password', passwordChangeLimiter, changePassword);
app.get('/online-users', getOnlineUsers);

// Room routes
app.post('/token', generateToken);
app.post('/mute-all', muteAllParticipants);
app.post('/unmute-all', unmuteAllParticipants);
app.post('/logout-all', logoutAllParticipants);
app.post('/logout-user', logoutUser);

// Recording routes - Session recordings (Admin)
app.post('/start-session-recording', startSessionRecording);
app.post('/stop-session-recording', stopSessionRecording);
app.get('/session-recordings', getSessionRecordings);

// Recording routes - User clips
app.post('/upload-clip', upload.single('audio'), uploadUserClip);
app.get('/user-recordings', getUserRecordings);
app.get('/my-recordings', getMyRecordings);

// Recording routes - All recordings
app.get('/recordings', getRecordings);

// Legacy recording routes (backwards compatibility)
app.post('/start-recording', startRecording);
app.post('/stop-recording', stopRecording);

// Webhook for LiveKit Egress events
app.post('/webhook/egress', egressWebhook);

// Manual cleanup trigger (for testing)
app.post('/trigger-cleanup', async (req, res) => {
    await triggerCleanup();
    res.json({ message: 'Cleanup triggered' });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log('Rate limiting enabled: 100 req/15min global, 10 login attempts/15min');
    console.log(`Recordings storage: ${config.recordings.storagePath}`);
    console.log(`Recordings retention: ${config.recordings.retentionDays} days`);

    // Initialize cleanup job
    initCleanupJob();
});

