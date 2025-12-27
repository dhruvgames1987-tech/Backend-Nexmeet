import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';

import { login, changePassword, logout, getOnlineUsers } from './controllers/authController';
import { generateToken, muteAllParticipants, unmuteAllParticipants, logoutAllParticipants, logoutUser } from './controllers/roomController';
import { startRecording, stopRecording, getRecordings, egressWebhook } from './controllers/recordingsController';

const app = express();

// Trust proxy - Required when behind Nginx/Caddy reverse proxy
// This fixes the "X-Forwarded-For" rate limiting error
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// ==========================================
// RATE LIMITING - Protect against brute force
// ==========================================

// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limit for login: 5 attempts per 15 minutes per USERNAME (not IP!)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per username
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
    keyGenerator: (req) => {
        // Rate limit by username instead of IP
        // This prevents one user from locking out everyone
        return req.body?.username || req.ip;
    },
});

// Strict rate limit for password change: 3 attempts per hour
const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Only 3 password change attempts per hour
    message: { error: 'Too many password change attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply global rate limiting to all routes
app.use(globalLimiter);

// ==========================================
// ROUTES
// ==========================================

// Health check endpoint for monitoring
app.get('/', (req, res) => {
    res.send('NexMeet Backend is running');
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Auth routes (with stricter rate limits on sensitive endpoints)
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

// Recording routes
app.post('/start-recording', startRecording);
app.post('/stop-recording', stopRecording);
app.get('/recordings', getRecordings);
app.post('/webhook/egress', egressWebhook);

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log('Rate limiting enabled: 100 req/15min global, 5 login attempts/15min');
});
