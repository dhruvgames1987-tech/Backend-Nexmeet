import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { supabase } from '../supabaseClient';

/**
 * Cleanup job that runs daily to delete recordings older than retention period
 * Deletes both files from filesystem and metadata from database
 */
export const initCleanupJob = () => {
    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
        console.log('[Cleanup] Starting recording cleanup job...');
        await cleanupOldRecordings();
    });

    console.log(`[Cleanup] Scheduled daily cleanup for recordings older than ${config.recordings.retentionDays} days`);
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

// Manual trigger for testing
export const triggerCleanup = async () => {
    console.log('[Cleanup] Manual cleanup triggered');
    await cleanupOldRecordings();
};
