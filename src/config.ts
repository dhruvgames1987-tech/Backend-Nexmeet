import dotenv from 'dotenv';

dotenv.config();

export const config = {
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

if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.wsUrl) {
    console.warn('WARNING: LiveKit credentials are missing in .env');
}

if (!config.supabase.url || !config.supabase.key) {
    console.warn('WARNING: Supabase credentials are missing in .env');
}

