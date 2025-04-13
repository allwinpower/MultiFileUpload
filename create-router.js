import express from 'express';
import { Server as TusServer } from '@tus/server'; // Renamed import to avoid conflict
import { FileStore } from '@tus/file-store';
import path from 'path';
import fsp from 'fs/promises';

/**
 * Ensures a directory exists asynchronously.
 * @param {string} dirPath - Absolute path to the directory.
 * @param {string} label - Label for logging purposes.
 * @throws Will throw an error if the directory cannot be created.
 */
async function ensureDirectoryExistsAsync(dirPath, label) {
    try {
        await fsp.mkdir(dirPath, { recursive: true });
        console.log(`[UploadManager] Ensured ${label} directory exists: ${dirPath}`);
    } catch (err) {
        console.error(`[UploadManager] FATAL: Could not create ${label} directory at ${dirPath}.`, err);
        throw new Error(`Failed to ensure ${label} directory: ${err.message}`); // Re-throw for initialization failure
    }
}

/**
 * Creates and initializes a tus upload handling router.
 *
 * @param {object} options - Configuration options.
 * @param {string} options.uploadsDir - The absolute path to the final destination directory for completed uploads.
 * @param {string} options.tmpDir - The absolute path to the directory for temporary tus files.
 * @returns {Promise<object>} A promise that resolves with an object containing the Express router and a 'ready' promise.
 * { router: Express.Router, ready: Promise<void> }
 */
async function createUploadRouter(options = {}) {
    // --- Validate Options ---
    if (!options.uploadsDir || typeof options.uploadsDir !== 'string') {
        throw new Error('createUploadRouter requires options.uploadsDir (string) parameter.');
    }
    if (!options.tmpDir || typeof options.tmpDir !== 'string') {
        throw new Error('createUploadRouter requires options.tmpDir (string) parameter.');
    }
    if (!options.tusMountPath || typeof options.tusMountPath !== 'string') {
        throw new Error('createUploadRouter requires options.tusMountPath (string) parameter.');
    }

    // Ensure paths are absolute for reliability
    const UPLOADS_DIR = path.resolve(options.uploadsDir);
    const TMP_DIR = path.resolve(options.tmpDir);
    console.log(`[UploadManager] Configured final uploads directory: ${UPLOADS_DIR}`);
    console.log(`[UploadManager] Configured temporary directory: ${TMP_DIR}`);

    // --- Perform Initialization (Async Directory Creation) ---
    // We return a promise that resolves when directories are ready.
    const initializationPromise = (async () => {
        await ensureDirectoryExistsAsync(UPLOADS_DIR, 'Uploads');
        await ensureDirectoryExistsAsync(TMP_DIR, 'Temporary');
        console.log('[UploadManager] Directories ensured.');
    })();


    // --- tus Server Configuration ---
    // Note: The 'path' option for TusServer here is relative to where the *router* is mounted.
    // Using '/' means tus will handle requests directly at the mount point (e.g., if mounted
    // at '/files', tus handles POST /files, PATCH /files/:id, etc.)
    const tusServer = new TusServer({
        path: options.tusMountPath,
        datastore: new FileStore({ directory: TMP_DIR }),

        // Reuse the hooks from your original code, but use the resolved UPLOADS_DIR
        onUploadCreate: async (req, upload) => {
            console.log(`[UploadManager tus] Upload creation requested. Metadata:`, upload.metadata);
            const requiredMeta = ['filename', 'groupId'];
            const missingMeta = requiredMeta.filter(key => !upload.metadata?.[key]);
            if (missingMeta.length > 0) {
                console.warn(`[UploadManager tus] Upload rejected. Missing metadata: ${missingMeta.join(', ')}`);
                throw { status_code: 400, body: `Missing ${missingMeta.map(m => `'${m}'`).join(' and ')} in metadata` };
            }
            console.log(`[UploadManager tus] Allowing creation for group ${upload.metadata.groupId}, file ${upload.metadata.filename}`);
            return upload;
        },

        onUploadFinish: async (req, file) => {
            console.log(`[UploadManager tus] Upload finished: ${file.id}. Metadata:`, file.metadata);
            const tmpPath = path.join(TMP_DIR, file.id);
            const jsonPath = `${tmpPath}.json`; // Path to the .json metadata file tus creates
            const { filename: originalFilename, groupId } = file.metadata || {};

            if (!originalFilename || !groupId) {
                console.error(`[UploadManager tus] Integrity Error: Missing filename or groupId for completed upload ${file.id}. Metadata:`, file.metadata);
                // Attempt cleanup of orphaned files
                await fsp.unlink(tmpPath).catch(e => console.error(`[CleanUp Error] Failed to delete temp file ${tmpPath}`, e));
                await fsp.unlink(jsonPath).catch(e => console.warn(`[CleanUp Warning] Failed to delete .json file ${jsonPath}`, e));
                throw { status_code: 500, body: `Server integrity error processing upload ${file.id}` };
            }

            // Sanitize filename and groupId for filesystem safety
            const safeFilename = path.basename(originalFilename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
            const safeGroupId = String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_'); // Allow alphanumeric, underscore, hyphen
            const destinationFolder = path.join(UPLOADS_DIR, safeGroupId);
            const finalPath = path.join(destinationFolder, safeFilename);

            console.log(`[UploadManager tus] Group: ${safeGroupId} - Moving ${tmpPath} to ${finalPath}`);

            try {
                await fsp.mkdir(destinationFolder, { recursive: true }); // Ensure group subfolder exists
                await fsp.rename(tmpPath, finalPath); // Move the actual file
                console.log(`[UploadManager tus] Group: ${safeGroupId} - Successfully moved file to: ${finalPath}`);

                // Attempt to clean up the metadata file after successful move
                await fsp.unlink(jsonPath).catch(jsonErr => console.warn(`[CleanUp Warning] Could not delete .json file: ${jsonPath}`, jsonErr.message));

                // Optionally, you can customize the response body tus sends back on success
                // The tus protocol itself only requires a 204 No Content on PATCH success.
                // This hook allows adding a body, often useful for client feedback.
                // Note: If you return a response here, tus-js-client might not trigger
                // the `onSuccess` callback in the same way if it expects 204. Test this.
                // return {
                //     statusCode: 200, // Or 204 if you don't want a body
                //     body: JSON.stringify({ message: `File ${safeFilename} uploaded to group ${safeGroupId}.`, finalPath }),
                //     headers: { 'Content-Type': 'application/json'}
                // };
                // By default (returning nothing or undefined), tus server handles the final 204 response for PATCH.

            } catch (error) {
                console.error(`[UploadManager tus] Group: ${safeGroupId} - Error moving/cleaning finished upload ${file.id}:`, error);
                // Attempt cleanup even on failure to move
                await fsp.unlink(tmpPath).catch(e => { /* Ignore */ });
                await fsp.unlink(jsonPath).catch(e => { /* Ignore */ });
                // Signal an error to the tus server
                throw { status_code: 500, body: `Server error storing file ${safeFilename}` };
            }
        },
    });

    // --- Create Router ---
    const router = express.Router();

    // --- Define Middleware on the Router ---
    // This single middleware delegates all relevant HTTP methods (POST, PATCH, HEAD, DELETE, OPTIONS)
    // for the '/files' path (or whatever it's mounted at) to the tus server.
    router.use('/', (req, res) => { // Use '/' to catch all requests at the router's mount point
        // Add the same robust ECONNRESET handling
        req.on('error', (err) => {
            if (err.code === 'ECONNRESET') {
                console.warn(`[UploadManager Request Stream] Handled: Client disconnected (ECONNRESET) for ${req.method} ${req.originalUrl}.`);
            } else {
                console.error('[UploadManager Request Stream] Unexpected error:', err);
            }
        });

        res.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
                console.warn(`[UploadManager Response Stream] Handled: Socket error (${err.code}) for ${req.method} ${req.originalUrl}.`);
            } else {
                console.error('[UploadManager Response Stream] Unexpected error:', err);
            }
        });

        // Let the tus server handle the request
        tusServer.handle(req, res).catch(error => {
            // Generic error handler for tus server issues
            console.error('[UploadManager tus Error Handler] Error during tus request processing:', error);
            if (!res.headersSent && res.socket?.writable) {
                // Use status_code and body from tus errors if available
                const statusCode = error.status_code || 500;
                const message = error.body || 'Internal Server Error.';
                try {
                    // Ensure correct headers for plain text error
                    res.writeHead(statusCode, {
                        'Content-Type': 'text/plain',
                        'Content-Length': Buffer.byteLength(message)
                    });
                    res.end(message);
                } catch (e) {
                    console.error('[UploadManager tus Error Handler] Error sending error response:', e);
                    if (res.socket && !res.socket.destroyed) res.socket.destroy();
                }
            } else {
                console.warn('[UploadManager tus Error Handler] Cannot send error response (headers sent or socket not writable).');
                if (res.socket && !res.socket.destroyed) res.socket.destroy();
            }
        });
    });

    // Return the router and the promise indicating readiness
    return {
        router: router,
        ready: initializationPromise
    };
}

// Export the factory function as the default export
export default createUploadRouter;