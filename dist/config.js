"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 3000,
    livekit: {
        apiKey: process.env.LIVEKIT_API_KEY || '',
        apiSecret: process.env.LIVEKIT_API_SECRET || '',
        wsUrl: process.env.LIVEKIT_WS_URL || '',
    },
    supabase: {
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_KEY || '',
    }
};
if (!exports.config.livekit.apiKey || !exports.config.livekit.apiSecret || !exports.config.livekit.wsUrl) {
    console.warn('WARNING: LiveKit credentials are missing in .env');
}
if (!exports.config.supabase.url || !exports.config.supabase.key) {
    console.warn('WARNING: Supabase credentials are missing in .env');
}
