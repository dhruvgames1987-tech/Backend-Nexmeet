import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { supabase } from '../supabaseClient';

// How long (in hours) before a 'recording' status is considered stale
const STALE_RECORDING_HOURS = 2;

/**
 * Cleanup job that runs daily to delete recordings older than retention period
 * Deletes both files from filesystem and metadata from database.
 * Also marks stale recordings (stuck in 'recording' status) as 'failed'.
 */
export const initCleanupJob = () => {
    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
        console.log('[Cleanup] Starting recording cleanup job...');
        await cleanupStaleRecordings();
        await cleanupOldRecordings();
    });

    // Also run stale recording cleanup on server startup (delayed by 30s)
    setTimeout(async () => {
        console.log('[Cleanup] Running startup stale recording cleanup...');
        await cleanupStaleRecordings();
    }, 30000);

    console.log(`[Cleanup] Scheduled daily cleanup for recordings older than ${config.recordings.retentionDays} days`);
};

/**
 * Mark recordings stuck in 'recording' status for too long as 'failed'.
 * This catches cases where:
 * - The egress failed silently
 * - The stop recording request was never sent
 * - The webhook never fired
 */
export const cleanupStaleRecordings = async () => {
    try {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - STALE_RECORDING_HOURS);

        const { data: staleRecordings, error: fetchError } = await supabase
            .from('recordings')
            .select('id, egress_id, room_name, started_at')
            .eq('status', 'recording')
            .lt('started_at', cutoffTime.toISOString());

        if (fetchError) {
            console.error('[Cleanup] Error fetching stale recordings:', fetchError);
            return;
        }

        if (!staleRecordings || staleRecordings.length === 0) {
            console.log('[Cleanup] No stale recordings found');
            return;
        }

        console.log(`[Cleanup] Found ${staleRecordings.length} stale recording(s) stuck in 'recording' status`);

        for (const rec of staleRecordings) {
            const { error: updateError } = await supabase
                .from('recordings')
                .update({
                    status: 'failed',
                    ended_at: new Date().toISOString(),
                })
                .eq('id', rec.id);

            if (updateError) {
                console.error(`[Cleanup] Error marking recording ${rec.id} as failed:`, updateError);
            } else {
                console.log(`[Cleanup] Marked stale recording ${rec.id} (room: ${rec.room_name}, started: ${rec.started_at}) as failed`);
            }
        }
    } catch (err) {
        console.error('[Cleanup] Unexpected error during stale recording cleanup:', err);
    }
};

export const cleanupOldRecordings = async () => {
    try {
        // Get recordings that have expired
        const { data: expiredRecordings, error } = await supabase
            .from('recordings')
            .select('id, file_url, egress_id')
            .lt('expires_at', new Date().toISOString());

        if (error) {
            console.error('[Cleanup] Error fetching expired recordings:', error);
            return;
        }

        if (!expiredRecordings || expiredRecordings.length === 0) {
            console.log('[Cleanup] No expired recordings found');
            return;
        }

        console.log(`[Cleanup] Found ${expiredRecordings.length} expired recordings`);

        let deletedFiles = 0;
        let deletedRecords = 0;

        for (const recording of expiredRecordings) {
            // Delete file from filesystem if it exists
            if (recording.file_url) {
                try {
                    // Extract filename from URL or path
                    const filePath = recording.file_url.startsWith('/')
                        ? recording.file_url
                        : path.join(config.recordings.storagePath, recording.file_url);

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        deletedFiles++;
                        console.log(`[Cleanup] Deleted file: ${filePath}`);
                    }
                } catch (fileError) {
                    console.error(`[Cleanup] Error deleting file for recording ${recording.id}:`, fileError);
                }
            }

            // Delete from database
            const { error: deleteError } = await supabase
                .from('recordings')
                .delete()
                .eq('id', recording.id);

            if (deleteError) {
                console.error(`[Cleanup] Error deleting recording ${recording.id} from DB:`, deleteError);
            } else {
                deletedRecords++;
            }
        }

        console.log(`[Cleanup] Completed: ${deletedFiles} files and ${deletedRecords} records deleted`);
    } catch (err) {
        console.error('[Cleanup] Unexpected error during cleanup:', err);
    }
};

// Manual trigger for testing (runs both stale + expired cleanups)
export const triggerCleanup = async () => {
    console.log('[Cleanup] Manual cleanup triggered');
    await cleanupStaleRecordings();
    await cleanupOldRecordings();
};
