import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Cut a [startSec, startSec + durationSec] segment out of an OGG/Opus file.
 *
 * Uses ffmpeg with stream copy (-c copy): no decode/re-encode, so it is fast,
 * lossless, and — importantly — does NOT need the WebCodecs API (which is
 * unavailable in Node, ruling out mediabunny's transcoding path on the server).
 * Requires ffmpeg on PATH (installed in the Docker image via `apk add ffmpeg`).
 *
 * Input seeking (-ss before -i) lands on the nearest Opus packet boundary,
 * which is sub-frame accurate for our purposes (~20ms). We use -t (duration)
 * rather than -to to keep the end time unambiguous with input seeking.
 */
export const sliceAudioClip = async (
    sourcePath: string,
    destPath: string,
    startSec: number,
    durationSec: number,
): Promise<void> => {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source recording not found: ${sourcePath}`);
    }

    const start = Math.max(0, startSec);
    const dur = Math.max(0.1, durationSec);

    await execFileAsync('ffmpeg', [
        '-y',
        '-ss', start.toFixed(3),
        '-i', sourcePath,
        '-t', dur.toFixed(3),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        destPath,
    ]);
};
