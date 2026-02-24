"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const authController_1 = require("./controllers/authController");
const roomController_1 = require("./controllers/roomController");
const recordingsController_1 = require("./controllers/recordingsController");
const cleanupJob_1 = require("./utils/cleanupJob");
const app = (0, express_1.default)();
// Trust proxy - Required when behind Nginx/Caddy reverse proxy
app.set('trust proxy', 1);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================
const upload = (0, multer_1.default)({
    dest: path_1.default.join(config_1.config.recordings.storagePath, 'temp'),
    limits: {
        fileSize: config_1.config.recordings.maxFileSize
    }
});
// ==========================================
// STATIC FILE SERVING FOR RECORDINGS
// ==========================================
app.use('/recordings', express_1.default.static(config_1.config.recordings.storagePath));
// ==========================================
// RATE LIMITING - Protect against brute force
// ==========================================
// Global rate limit: 5000 requests per 15 minutes per IP (to accommodate app polling)
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Strict rate limit for login: 30 attempts per 5 minutes per USERNAME
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000,
    max: 30,
    message: { error: 'Too many login attempts. Please try again in 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => { var _a; return ((_a = req.body) === null || _a === void 0 ? void 0 : _a.username) || req.ip; },
});
// Strict rate limit for password change: 3 attempts per hour
const passwordChangeLimiter = (0, express_rate_limit_1.default)({
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
app.post('/login', loginLimiter, authController_1.login);
app.post('/logout', authController_1.logout);
app.post('/change-password', passwordChangeLimiter, authController_1.changePassword);
app.get('/online-users', authController_1.getOnlineUsers);
// Room routes
app.post('/token', roomController_1.generateToken);
app.post('/mute-all', roomController_1.muteAllParticipants);
app.post('/unmute-all', roomController_1.unmuteAllParticipants);
app.post('/logout-all', roomController_1.logoutAllParticipants);
app.post('/logout-user', roomController_1.logoutUser);
// Recording routes - Session recordings (Admin)
app.post('/start-session-recording', recordingsController_1.startSessionRecording);
app.post('/stop-session-recording', recordingsController_1.stopSessionRecording);
app.get('/session-recordings', recordingsController_1.getSessionRecordings);
// Recording routes - User clips
app.post('/start-user-clip-recording', recordingsController_1.startUserClipRecording);
app.post('/stop-user-clip-recording', recordingsController_1.stopUserClipRecording);
app.post('/upload-clip', upload.single('audio'), recordingsController_1.uploadUserClip);
app.get('/user-recordings', recordingsController_1.getUserRecordings);
app.get('/my-recordings', recordingsController_1.getMyRecordings);
// Recording routes - All recordings
app.get('/recordings', recordingsController_1.getRecordings);
// Legacy recording routes (backwards compatibility)
app.post('/start-recording', recordingsController_1.startRecording);
app.post('/stop-recording', recordingsController_1.stopRecording);
// Webhook for LiveKit Egress events
app.post('/webhook/egress', recordingsController_1.egressWebhook);
// Manual cleanup trigger (for testing)
app.post('/trigger-cleanup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, cleanupJob_1.triggerCleanup)();
    res.json({ message: 'Cleanup triggered' });
}));
// ==========================================
// START SERVER
// ==========================================
app.listen(config_1.config.port, () => {
    console.log(`Server running on port ${config_1.config.port}`);
    console.log('Rate limiting enabled: 5000 req/15min global, 30 login attempts/5min');
    console.log(`Recordings storage: ${config_1.config.recordings.storagePath}`);
    console.log(`Recordings retention: ${config_1.config.recordings.retentionDays} days`);
    // Initialize cleanup job
    (0, cleanupJob_1.initCleanupJob)();
});
