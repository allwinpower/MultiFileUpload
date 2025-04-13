import express from 'express';
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import path from 'path';
import fs from 'fs'; // Keep fs for synchronous startup check
import fsp from 'fs/promises'; // Use fs/promises for async operations
import { fileURLToPath } from 'url';

// --- Configuration Constants ---
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, 'uploads'); // Final uploads destination base
const TMP_DIR = path.join(__dirname, 'uploads_tmp'); // tus temporary files
const TUS_ENDPOINT_PATH = '/files'; // Must match client endpoint path

// --- Global Error Handlers (Implement BEFORE starting server) ---

process.on('uncaughtException', (err, origin) => {
    console.error('<<<<< UNCAUGHT EXCEPTION >>>>>');
    console.error(`Caught exception: `, err);
    console.error(`Exception origin: ${origin}`);
    console.error('Application is in an unknown state. Initiating shutdown...');

    // Attempt a quick graceful shutdown (might fail if server is badly corrupted)
    // Make sure 'httpServer' is accessible here (declare it outside listen scope or pass it)
    // For simplicity, we assume httpServer might be defined later. If not, skip close().
    if (httpServer) {
        httpServer.close(() => {
            console.error('HTTP server closed.');
            process.exit(1); // Exit with failure code
        });
    } else {
        process.exit(1); // Exit immediately if server instance not available
    }

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
        console.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 3000); // Short timeout (e.g., 3 seconds) for critical failure
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('<<<<< UNHANDLED REJECTION >>>>>');
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optional: Initiate shutdown similar to uncaughtException,
    // as an unhandled rejection can also lead to an unstable state.
    // For now, just logging, but consider adding shutdown logic if needed.
    // process.emit('uncaughtException', new Error(`Unhandled Rejection: ${reason}`), 'unhandledRejection'); // Option to trigger the main handler
});


// --- Helper: Ensure Directory Exists (Sync for startup is acceptable) ---
function ensureDirectoryExists(dirPath, label) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created ${label} directory: ${dirPath}`);
        } else {
            console.log(`${label} directory exists: ${dirPath}`);
        }
    } catch (err) {
        console.error(`Fatal Error: Could not create ${label} directory at ${dirPath}.`, err);
        process.exit(1);
    }
}

// --- Setup ---
const app = express();
ensureDirectoryExists(UPLOADS_DIR, 'Uploads');
ensureDirectoryExists(TMP_DIR, 'Temporary');

// --- tus Server Configuration ---
const tusServer = new Server({
    path: TUS_ENDPOINT_PATH,
    datastore: new FileStore({ directory: TMP_DIR }),

    onUploadCreate: async (req, upload) => {
        console.log(`[tus] Upload creation requested. Metadata:`, upload.metadata);
        const requiredMeta = ['filename', 'groupId'];
        const missingMeta = requiredMeta.filter(key => !upload.metadata?.[key]);
        if (missingMeta.length > 0) {
            throw { status_code: 400, body: `Missing ${missingMeta.map(m => `'${m}'`).join(' and ')} in metadata` };
        }
        console.log(`[tus] Allowing creation for group ${upload.metadata.groupId}, file ${upload.metadata.filename}`);
        return upload;
    },

    onUploadFinish: async (req, file) => {
        console.log(`[tus] Upload finished: ${file.id}. Metadata:`, file.metadata);
        const tmpPath = path.join(TMP_DIR, file.id);
        const jsonPath = `${tmpPath}.json`;
        const { filename: originalFilename, groupId } = file.metadata || {};

        if (!originalFilename || !groupId) {
            console.error(`[tus] Integrity Error: Missing filename or groupId for completed upload ${file.id}. Metadata:`, file.metadata);
            await fsp.unlink(tmpPath).catch(e => console.error(`[CleanUp Error] Failed to delete temp file ${tmpPath}`, e));
            await fsp.unlink(jsonPath).catch(e => console.warn(`[CleanUp Warning] Failed to delete .json file ${jsonPath}`, e));
            throw { status_code: 500, body: `Server integrity error processing upload ${file.id}` };
        }

        const safeFilename = path.basename(originalFilename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        const safeGroupId = String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const destinationFolder = path.join(UPLOADS_DIR, safeGroupId);
        const finalPath = path.join(destinationFolder, safeFilename);

        console.log(`[tus] Group: ${safeGroupId} - Moving ${tmpPath} to ${finalPath}`);

        try {
            await fsp.mkdir(destinationFolder, { recursive: true });
            await fsp.rename(tmpPath, finalPath);
            console.log(`[tus] Group: ${safeGroupId} - Successfully moved file to: ${finalPath}`);
            await fsp.unlink(jsonPath).catch(jsonErr => console.warn(`[CleanUp Warning] Could not delete .json file: ${jsonPath}`, jsonErr.message));
            return {
                statusCode: 200,
                body: JSON.stringify({ message: `File ${safeFilename} uploaded to group ${safeGroupId}.`, finalPath })
            };
        } catch (error) {
            console.error(`[tus] Group: ${safeGroupId} - Error moving/cleaning finished upload ${file.id}:`, error);
            await fsp.unlink(tmpPath).catch(e => { /* Ignore */ });
            await fsp.unlink(jsonPath).catch(e => { /* Ignore */ });
            throw { status_code: 500, body: `Server error storing file ${safeFilename}` };
        }
    },
});

// --- Express Application Setup ---

// Middleware for handling tus uploads - WITH ECONNRESET FIX in handlers
app.use(TUS_ENDPOINT_PATH, (req, res, next) => {
    // Request Stream Error Handler
    req.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            console.warn(`[Request Stream] Handled: Client disconnected (ECONNRESET) for ${req.method} ${req.originalUrl}.`);
        } else {
            console.error('[Request Stream] Unexpected error:', err);
            // Avoid destroying socket here unless absolutely necessary and confident it won't cause cascades
        }
    });

    // Response Stream Error Handler
    res.on('error', (err) => {
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            console.warn(`[Response Stream] Handled: Socket error (${err.code}) for ${req.method} ${req.originalUrl}.`);
        } else {
            console.error('[Response Stream] Unexpected error:', err);
        }
    });

    // Delegate to the tus server
    tusServer.handle(req, res).catch(error => {
        console.error('[tus Error Handler] Error during tus request processing:', error);
        if (!res.headersSent && res.socket?.writable) {
            const statusCode = error.status_code || 500;
            const message = error.body || 'Internal Server Error.';
            try {
                res.writeHead(statusCode, { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(message) });
                res.end(message);
            } catch (e) {
                console.error('[tus Error Handler] Error sending error response:', e);
                if (res.socket && !res.socket.destroyed) res.socket.destroy();
            }
        } else {
            console.warn('[tus Error Handler] Cannot send error response (headers sent or socket not writable).');
            if (res.socket && !res.socket.destroyed) res.socket.destroy();
        }
    });
});

// Serve all static files from the 'dist' folder
app.get('/multi-file-upload-component.min.js', (req, res) => {
    const htmlPath = path.join(__dirname, 'dist', 'multi-file-upload-component.min.js');
    res.sendFile(htmlPath, (err) => {
        if (err) {
            console.error(`[SendFile Error] Error sending file ${htmlPath}:`, err);
            if (!res.headersSent) {
                res.status(err.status || 500).send("Server error: Could not load page.");
            }
        }
    });
});

// Route for serving the main HTML page
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'demo.html');
    res.sendFile(htmlPath, (err) => {
        if (err) {
            console.error(`[SendFile Error] Error sending file ${htmlPath}:`, err);
            if (!res.headersSent) {
                res.status(err.status || 500).send("Server error: Could not load page.");
            }
        }
    });
});


// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).send("Resource Not Found");
});


// --- Server Start ---
// Declare httpServer variable here so it's accessible in uncaughtException handler
let httpServer;

httpServer = app.listen(PORT, () => {
    const currentDateTime = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok',
        dateStyle: 'full',
        timeStyle: 'long'
    });
    console.log(`------------------------------------------------------`);
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Startup time: ${currentDateTime} (Asia/Bangkok)`);
    console.log(`tus endpoint available at http://localhost:${PORT}${TUS_ENDPOINT_PATH}`);
    console.log(`Uploads folder: ${UPLOADS_DIR}`);
    console.log(`Temporary folder: ${TMP_DIR}`);
    console.log(`------------------------------------------------------`);
});

// Low-level socket error handler (Refined: Primarily for logging known client issues)
httpServer.on('clientError', (err, socket) => {
    let logMessage = '[HTTP Server] Client connection error:';
    if (err.code === 'ECONNRESET') {
        logMessage = '[HTTP Server] Handled client disconnect (ECONNRESET).';
    } else if (err.code === 'HPE_INVALID_EOF_STATE') {
        logMessage = '[HTTP Server] Handled incomplete HTTP request (HPE_INVALID_EOF_STATE).';
    } else {
        logMessage = '[HTTP Server] Unexpected clientError:'; // Log others more prominently
    }

    console.warn(`${logMessage} Code: ${err.code || 'N/A'}`);
    // Only log full stack for truly unexpected errors
    if (err.code !== 'ECONNRESET' && err.code !== 'HPE_INVALID_EOF_STATE') {
        console.error(err);
    }

    // Avoid actively destroying the socket here; let Node's default handling manage it
    // unless there's a specific reason to intervene (e.g., sending 400 response is unreliable here)
    if (!socket.destroyed) {
        // Maybe just ensure it gets destroyed if it's an unexpected error?
        // socket.destroy(err); // Reconsider if needed, potentially causes cascades.
    }
});

// Graceful Shutdown Handlers (SIGTERM/SIGINT remain crucial)
const gracefulShutdown = (signal) => {
    console.log(`${signal} signal received: Closing server gracefully...`);
    httpServer.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Graceful shutdown timed out after 10 seconds. Forcing exit.');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
