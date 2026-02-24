"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 4000,
    livekit: {
        apiKey: process.env.LIVEKIT_API_KEY || '',
        apiSecret: process.env.LIVEKIT_API_SECRET || '',
        wsUrl: process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || '',
    },
    supabase: {
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_KEY || '',
    },
    recordings: {
        // Local storage path for recordings (will be mounted in Docker)
        storagePath: process.env.RECORDINGS_PATH || '/app/recordings',
        // Retention period in days
        retentionDays: parseInt(process.env.RECORDINGS_RETENTION_DAYS || '15', 10),
        // Max file size in bytes (100MB default)
        maxFileSize: parseInt(process.env.MAX_RECORDING_SIZE || '104857600', 10),
    }
};
if (!exports.config.livekit.apiKey || !exports.config.livekit.apiSecret || !exports.config.livekit.wsUrl) {
    console.warn('WARNING: LiveKit credentials are missing in .env');
}
if (!exports.config.supabase.url || !exports.config.supabase.key) {
    console.warn('WARNING: Supabase credentials are missing in .env');
}
