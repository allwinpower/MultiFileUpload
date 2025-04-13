import * as tus from 'tus-js-client'; // Import the library

// 1. Define the HTML structure and CSS within a <template>
const template = document.createElement('template');
template.innerHTML = `
       <style>
         /* --- Component-Specific Styles --- */
         :host {
           /* --- Base Layout --- */
           display: flex;
           /* Default: side-by-side, progress right */
           flex-direction: row;
           gap: 10px; /* Space between elements */
           min-height: 250px; /* Give it some initial minimum height */
           box-sizing: border-box;
           /* width: 100%; /* Uncomment if the host needs to fill container width */
         }

         /* --- LAYOUT VARIATIONS based on 'progress-position' attribute --- */

         /* Default (Right): No specific selector needed, uses base :host styles */

         /* --- Progress Below --- */
         :host([progress-position="bottom"]) {
           flex-direction: column; /* Stack them vertically */
         }
         :host([progress-position="bottom"]) #upload-container {
           /* Allow upload container to size naturally in column layout */
           flex-basis: auto;
           /* It keeps its internal flex settings for dropzone */
         }
         :host([progress-position="bottom"]) #progress-area {
           flex-basis: auto;   /* Remove fixed width */
           flex-shrink: 1;     /* Allow shrinking if needed */
           width: 100%;       /* Take full available width */
           max-height: 350px;  /* Adjust max-height for vertical layout */
           /* Optional: Add margin-top if gap isn't sufficient */
           /* margin-top: 15px; */
         }

         /* --- Progress Left --- */
         :host([progress-position="left"]) {
           flex-direction: row-reverse; /* Reverse the row order */
         }
         /* Default flex properties on children usually work fine for row-reverse */


         /* --- Upload Area --- */
         #upload-container {
           flex: 1; /* Takes remaining space in row layout */
           display: flex;
           flex-direction: column; /* Internal layout: stack drop-zone items */
           min-width: 0; /* Prevent overflow issues in flex */
         }

         /* --- Drop Zone Styling --- */
         #drop-zone {
           border: 2px dashed #ced4da;
           border-radius: 8px;
           padding: 25px;
           text-align: center;
           cursor: pointer;
           background-color: #ffffff;
           transition: border-color 0.2s ease-in-out, background-color 0.2s ease-in-out;
           display: flex;
           flex-direction: column;
           justify-content: center;
           align-items: center;
           min-height: 160px;
           box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
           flex-grow: 1; /* Allow drop zone to grow within upload-container */
           box-sizing: border-box;
         }

         #drop-zone.drag-over {
           border-color: #0d6efd;
           background-color: #f0f8ff;
         }

         #drop-zone p {
           margin: 5px 0;
           color: #6c757d;
           font-size: 0.95em;
         }

         #browse-btn {
           padding: 8px 18px;
           background-color: #0d6efd;
           color: white;
           border: none;
           border-radius: 5px;
           cursor: pointer;
           font-size: 0.9em;
           margin-top: 10px;
           transition: background-color 0.2s ease;
         }

         #browse-btn:hover {
           background-color: #0b5ed7;
         }

         #drop-zone::before {
           content: '📤';
           font-size: 2.5em;
           color: #ced4da;
           margin-bottom: 10px;
           transition: color 0.2s ease-in-out;
         }

         #drop-zone.drag-over::before { color: #0d6efd; }


         /* --- Progress Area --- */
         #progress-area {
           /* Default state (usually for right/left position) */
           flex-basis: 380px; /* Default fixed width */
           flex-shrink: 0;    /* Don't shrink by default */
           border: 1px solid #dee2e6;
           background-color: #ffffff;
           border-radius: 8px;
           padding: 20px;
           overflow-y: auto; /* Scroll if content exceeds max-height */
           box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
           max-height: 500px; /* Default max height for side-by-side */
           box-sizing: border-box;
           display: flex; /* Use flex internally for alignment */
           flex-direction: column; /* Stack title and messages */
         }

         #progress-area h2 {
           text-align: center;
           margin-top: 0;
           margin-bottom: 15px;
           font-size: 1.15em;
           color: #495057;
           border-bottom: 1px solid #e9ecef;
           padding-bottom: 10px;
           flex-shrink: 0; /* Prevent title from shrinking */
         }

         /* --- Progress Message Styling --- */
         .progress-message {
           padding: 8px 12px;
           margin-bottom: 8px;
           border-radius: 4px;
           font-size: 0.88em;
           line-height: 1.4;
           border: 1px solid transparent;
           word-wrap: break-word; /* Prevent long names from breaking layout */
           overflow-wrap: break-word; /* Alternative for word-wrap */
           transition: background-color 0.3s ease, border-color 0.3s ease;
           position: relative;
           flex-shrink: 0; /* Prevent messages from shrinking oddly */
         }
         /* Remove margin from last message */
         .progress-message:last-child {
            margin-bottom: 0;
         }

         .status-waiting { background-color: #f8f9fa; border-color: #e9ecef; color: #6c757d; }
         .status-uploading { background-color: #e7f3ff; border-color: #cfe2ff; color: #052c65; }
         .status-success { background-color: #d1e7dd; border-color: #badbcc; color: #0f5132; }
         .status-error { background-color: #f8d7da; border-color: #f5c2c7; color: #58151c; }

         .error-details {
           font-size: 0.9em;
           margin-top: 4px;
           color: #842029;
           display: block;
           word-wrap: break-word;
           overflow-wrap: break-word;
         }

         #initial-placeholder {
             text-align: center;
             color: #6c757d;
             margin: auto; /* Center vertically within progress-area flex */
             font-style: italic;
             padding: 20px; /* Add some padding */
             flex-grow: 1; /* Allow it to take space */
             display: flex;
             align-items: center;
             justify-content: center;
         }
       </style>

       <div id="upload-container">
           <input type="file" id="file-input" multiple hidden>
           <div id="drop-zone">
               <p>Drag & Drop files here</p>
               <p style="font-size: 0.8em; margin-top: 0;">or</p>
               <button type="button" id="browse-btn">Browse Files</button>
           </div>
       </div>

       <div id="progress-area">
           <h2>Upload Status</h2>
           </div>
     `;


// 2. Create the Custom Element Class
class MultiFileUpload extends HTMLElement {

    // Define attributes to observe for changes
    static get observedAttributes() {
        return ['endpoint', 'max-concurrent-uploads', 'retry-delays', 'group-id', 'progress-position'];
    }

    constructor() {
        super(); // Always call super first

        // --- State and Configuration ---
        this.uploadQueue = [];
        this.activeUploadCount = 0;
        this.activeUploads = {};
        this._tusEndpoint = '/files/';
        this._maxConcurrentUploads = 3;
        this._retryDelays = [0, 3000, 5000, 10000];
        this._currentGroupId = null;
        this.successfulUploads = []; // *** ADDED: Array to store successful uploads ***

        // --- Bound event listeners ---
        this._boundHandleBrowseClick = this._handleBrowseClick.bind(this);
        this._boundHandleFileChange = this._handleFileChange.bind(this);
        this._boundPreventDefaults = this._preventDefaults.bind(this);
        this._boundHighlight = this._highlight.bind(this);
        this._boundUnhighlight = this._unhighlight.bind(this);
        this._boundHandleDrop = this._handleDrop.bind(this);


        // Attach Shadow Root
        this.attachShadow({ mode: 'open' });

        // Clone template and append to shadow root
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        // Get references to internal elements
        this._dropZone = this.shadowRoot.getElementById('drop-zone');
        this._fileInput = this.shadowRoot.getElementById('file-input');
        this._browseBtn = this.shadowRoot.getElementById('browse-btn');
        this._progressArea = this.shadowRoot.getElementById('progress-area');

        console.log(`[Component] Initialized.`);
    }

    // --- Lifecycle Callbacks ---

    connectedCallback() {
        console.log('[Component] Added to the page.');
        this._updateConfigFromAttributes();
        this._addEventListeners();
        this._addInitialPlaceholder();
    }

    disconnectedCallback() {
        console.log('[Component] Removed from the page.');
        this._removeEventListeners();
        Object.values(this.activeUploads).forEach(upload => {
            try {
                upload?.abort();
                console.log(`[Component] Aborted upload for ${upload?.file?.name} on disconnect.`);
            } catch (e) {
                console.warn(`[Component] Could not abort upload`, e);
            }
        });
        this.activeUploads = {};
        this.uploadQueue = [];
        this.activeUploadCount = 0;
        // Note: successfulUploads is NOT cleared here by default.
        // If you want to clear it on disconnect/reconnect, add: this.successfulUploads = [];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        console.log(`[Component] Attribute ${name} changed from ${oldValue} to ${newValue}`);
        if (oldValue !== newValue) {
            this._updateConfigFromAttributes();
        }
    }

    // --- Public API Methods ---

    /**
     * Checks if there are any uploads currently in progress.
     * @returns {boolean} True if uploads are active, false otherwise.
     */
    isUploading() {
        return this.activeUploadCount > 0;
    }

    /**
     * Initiates the upload process for a given list of files with a specific group ID.
     * This method OVERRIDES the 'group-id' attribute for this specific batch.
     * @param {FileList|File[]} files - The files to upload.
     * @param {string|number} groupId - A unique identifier for this batch of files.
     */
    uploadFiles(files, groupId) {
        if (!files || files.length === 0) {
            console.warn('[Component] uploadFiles called with no files.');
            return;
        }
        if (groupId === undefined || groupId === null || String(groupId).trim() === '') {
            console.error('[Component] uploadFiles requires a non-empty groupId.');
            return;
        }
        console.log(`[Component] Upload requested via uploadFiles method for Group ID: ${groupId}`);
        this._initiateBatchUpload(files, groupId);
    }

    // *** NEW: Public method to get successful uploads ***
    /**
     * Retrieves a list of files that have been successfully uploaded
     * by this component instance since it was created or last cleared.
     * @returns {Array<object>} An array of objects, each containing details of a successful upload:
     * { fileId: string, fileName: string, fileSize: number, fileType: string, groupId: string|number, uploadUrl: string|null, timestamp: Date }
     */
    getFiles() {
        // Return a shallow copy to prevent direct modification of the internal array
        //return [...this.successfulUploads];
        return this.successfulUploads.map(file => ({
            fileName: file.fileName,
            fileSize: file.fileSize,
            fileType: file.fileType
        }));
    }

    /**
     * Clears the internal list of successfully uploaded files.
     */
    clearSuccessfulUploads() {
        this.successfulUploads = [];
        console.log('[Component] List of successful uploads cleared.');
    }
    // *** END NEW METHODS ***


    // --- Configuration --- (No changes from your provided code)
    _updateConfigFromAttributes() {
        // Read TUS Endpoint
        if (this.hasAttribute('endpoint')) {
            this._tusEndpoint = this.getAttribute('endpoint');
        } else {
            this._tusEndpoint = '/files/';
        }

        // Read Max Concurrent Uploads
        if (this.hasAttribute('max-concurrent-uploads')) {
            const max = parseInt(this.getAttribute('max-concurrent-uploads'), 10);
            if (!isNaN(max) && max > 0) {
                this._maxConcurrentUploads = max;
            }
        } else {
            this._maxConcurrentUploads = 3;
        }

        // Read Retry Delays
        if (this.hasAttribute('retry-delays')) {
            try {
                const delays = JSON.parse(this.getAttribute('retry-delays'));
                if (Array.isArray(delays) && delays.every(d => typeof d === 'number')) {
                    this._retryDelays = delays;
                } else {
                    console.warn('[Component] Invalid retry-delays attribute format. Expected JSON array of numbers.');
                    this._retryDelays = [0, 3000, 5000, 10000];
                }
            } catch (e) {
                console.warn('[Component] Could not parse retry-delays attribute.', e);
                this._retryDelays = [0, 3000, 5000, 10000];
            }
        } else {
            this._retryDelays = [0, 3000, 5000, 10000];
        }

        // Read Group ID
        if (this.hasAttribute('group-id')) {
            const gid = this.getAttribute('group-id');
            if (gid && gid.trim() !== '') {
                this._currentGroupId = gid.trim();
            } else {
                console.warn("[Component] 'group-id' attribute is present but empty. It will be ignored for browse/drop actions.");
                this._currentGroupId = null;
            }
        } else {
            this._currentGroupId = null;
        }

        console.log(`[Component] Config updated: Endpoint=${this._tusEndpoint}, MaxConcurrent=${this._maxConcurrentUploads}, Retries=${JSON.stringify(this._retryDelays)}, CurrentGroupID=${this._currentGroupId}`);
    }

    // --- Event Listener Management --- (No changes from your provided code)
    _addEventListeners() {
        this._browseBtn.addEventListener('click', this._boundHandleBrowseClick);
        this._fileInput.addEventListener('change', this._boundHandleFileChange);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this._dropZone.addEventListener(eventName, this._boundPreventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            this._dropZone.addEventListener(eventName, this._boundHighlight, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            this._dropZone.addEventListener(eventName, this._boundUnhighlight, false);
        });
        this._dropZone.addEventListener('drop', this._boundHandleDrop, false);
    }

    _removeEventListeners() {
        this._browseBtn.removeEventListener('click', this._boundHandleBrowseClick);
        this._fileInput.removeEventListener('change', this._boundHandleFileChange);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this._dropZone.removeEventListener(eventName, this._boundPreventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            this._dropZone.removeEventListener(eventName, this._boundHighlight, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            this._dropZone.removeEventListener(eventName, this._boundUnhighlight, false);
        });
        this._dropZone.removeEventListener('drop', this._boundHandleDrop, false);
    }

    // --- Event Handlers (for Browse/Drop) --- (No changes from your provided code)
    _handleBrowseClick() {
        if (!this._currentGroupId) {
            console.error("[Component] Cannot browse for files: The 'group-id' attribute is not set or is empty on the <multi-file-upload> element.");
            alert("Error: Please ensure the upload component has a valid 'group-id' attribute set.");
            return;
        }
        this._fileInput.click();
    }

    _handleFileChange(e) {
        if (!this._currentGroupId) {
            console.error("[Component] Cannot process files from browse: The 'group-id' attribute is not set or is empty.");
            e.target.value = null; // Reset file input
            return;
        }
        console.log(`[Component] Files selected via browse. Using attribute Group ID: ${this._currentGroupId}`);
        this._initiateBatchUpload(e.target.files, this._currentGroupId);
        e.target.value = null;
    }

    _preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    _highlight() {
        this._dropZone.classList.add('drag-over');
    }

    _unhighlight() {
        this._dropZone.classList.remove('drag-over');
    }

    _handleDrop(e) {
        if (!this._currentGroupId) {
            console.error("[Component] Cannot process dropped files: The 'group-id' attribute is not set or is empty on the <multi-file-upload> element.");
            this._updateProgressMessage(`drop-error-${Date.now()}`, "Drop Failed: Missing 'group-id'", 'status-error', "The 'group-id' attribute must be set on the upload component.");
            return;
        }
        console.log(`[Component] Files dropped. Using attribute Group ID: ${this._currentGroupId}`);
        this._initiateBatchUpload(e.dataTransfer.files, this._currentGroupId);
    }

    // --- Centralized Batch Handling --- (No changes from your provided code)
    _initiateBatchUpload(files, groupId) {
        if (!files || files.length === 0) return;
        if (groupId === undefined || groupId === null || String(groupId).trim() === '') {
            console.error(`[Component] _initiateBatchUpload called without a valid groupId. Aborting batch.`);
            return;
        }

        console.log(`[Component] Adding ${files.length} file(s) to queue for Group ID: ${groupId}`);

        Array.from(files).forEach(file => {
            const fileId = `file-${groupId}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}-${file.size}-${file.lastModified}-${Math.random().toString(36).substring(2, 7)}`;
            const fileInfo = { file, groupId: groupId, fileId };

            if (this.shadowRoot.getElementById(fileId) || this.uploadQueue.some(item => item.fileId === fileId) || this.activeUploads[fileId]) {
                console.warn(`[Component] File ${file.name} (ID: ${fileId}) seems to be already queued or uploading. Skipping.`);
                return;
            }

            this._addProgressMessage(fileId, `Waiting: ${this._escapeHTML(file.name)} (${this._formatFileSize(file.size)})`);
            this.uploadQueue.push(fileInfo);
        });
        this._processQueue();
    }

    // --- Queue Management --- (No changes from your provided code)
    _processQueue() {
        console.log(`[Queue] Processing... Active: ${this.activeUploadCount}, Queue Length: ${this.uploadQueue.length}`);
        while (this.activeUploadCount < this._maxConcurrentUploads && this.uploadQueue.length > 0) {
            this.activeUploadCount++;
            const fileInfo = this.uploadQueue.shift();
            console.log(`[Queue] Starting upload for ${fileInfo.file.name} (ID: ${fileInfo.fileId}, Group: ${fileInfo.groupId}). Active count: ${this.activeUploadCount}`);
            this._startTusUpload(fileInfo);
        }

        if (this.uploadQueue.length === 0 && this.activeUploadCount === 0) {
            console.log("[Queue] Queue empty and no active uploads.");
            this._addInitialPlaceholder(); // Re-add placeholder if everything is done
        }
    }

    // --- TUS Upload Logic ---
    _startTusUpload(fileInfo) {
        if (typeof tus === 'undefined' || typeof tus.Upload !== 'function') {
            console.error("[Component] tus-js-client library not loaded or tus.Upload is not a function.");
            this._updateProgressMessage(fileInfo.fileId, `Error: ${this._escapeHTML(fileInfo.file.name)} - tus library issue`, 'status-error');
            this._uploadFinished(fileInfo.fileId, fileInfo.groupId, false); // Indicate failure
            return;
        }

        const { file, groupId, fileId } = fileInfo;
        this._updateProgressMessage(fileId, `Initiating: ${this._escapeHTML(file.name)}`, 'status-uploading');

        // Define uploadInstance here to be accessible in onSuccess
        let uploadInstance = null;

        const options = {
            endpoint: this._tusEndpoint,
            retryDelays: this._retryDelays,
            metadata: {
                filename: file.name,
                filetype: file.type || 'application/octet-stream',
                groupId: String(groupId)
            },
            id: fileId,
            onError: (error) => {
                console.error(`[tus Error - ${fileId}] ${file.name}:`, error);
                let errorMessage = String(error);
                if (error.originalRequest) {
                    errorMessage = `Network Error (${error.originalRequest.getStatus()}`;
                    const responseText = error.originalRequest.getResponseText();
                    if (responseText) {
                        errorMessage += `: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`;
                    }
                    errorMessage += ')';
                } else if (error.cause) {
                    errorMessage = String(error.cause);
                }
                this._updateProgressMessage(fileId, `Error: ${this._escapeHTML(file.name)}`, 'status-error', this._escapeHTML(errorMessage));
                this._uploadFinished(fileId, groupId, false); // Indicate failure
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                const percentage = bytesTotal > 0 ? ((bytesUploaded / bytesTotal) * 100).toFixed(0) : 0;
                this._updateProgressMessage(fileId, `Uploading (${percentage}%): ${this._escapeHTML(file.name)}`, 'status-uploading');
            },
            onSuccess: () => {
                console.log(`[tus Success - ${fileId}] Finished ${file.name} (Group: ${groupId})`);
                this._updateProgressMessage(fileId, `Success: ${this._escapeHTML(file.name)}`, 'status-success');
                const uploadUrl = uploadInstance ? uploadInstance.url : null; // Get URL from instance

                // *** ADDED: Store successful upload info ***
                const successRecord = {
                    fileId: fileId,
                    fileName: fileInfo.file.name,
                    fileSize: fileInfo.file.size,
                    fileType: fileInfo.file.type || 'application/octet-stream',
                    groupId: fileInfo.groupId,
                    uploadUrl: uploadUrl,
                    timestamp: new Date() // Record completion time
                };
                this.successfulUploads.push(successRecord);
                // *** END ADDED ***

                this._uploadFinished(fileId, groupId, true); // Indicate success

                // *** MODIFIED: Dispatch event with the successRecord ***
                this.dispatchEvent(new CustomEvent('upload-success', {
                    bubbles: true,
                    composed: true,
                    detail: { ...successRecord } // Send the structured record
                }));
                // *** END MODIFIED ***
            },
        };

        try {
            uploadInstance = new tus.Upload(file, options); // Assign to outer variable
            this.activeUploads[fileId] = uploadInstance;
            uploadInstance.start();
        } catch (error) {
            console.error(`[Component] Failed to initialize tus.Upload for ${file.name}:`, error);
            this._updateProgressMessage(fileId, `Error: ${this._escapeHTML(file.name)} - Init failed`, 'status-error', String(error));
            this._uploadFinished(fileId, groupId, false); // Indicate failure
        }
    }

    // --- _uploadFinished, UI Updates, Helpers ---
    // *** MODIFIED: Added 'success' parameter (optional) ***
    _uploadFinished(fileId, groupId, success) {
        if (this.activeUploads[fileId]) {
            this.activeUploadCount--;
            delete this.activeUploads[fileId];
            console.log(`[Queue] Upload ${success ? 'finished successfully' : 'failed/aborted'} (ID: ${fileId}, Group: ${groupId}). Active count: ${this.activeUploadCount}`);

            // Check if *all* uploads are complete (both active and queued are zero)
            if (this.activeUploadCount === 0 && this.uploadQueue.length === 0) {
                console.log('[Component] All known uploads finished and queue is empty.');
                this.dispatchEvent(new CustomEvent('all-uploads-complete', {
                    bubbles: true,
                    composed: true,
                }));
                this._addInitialPlaceholder(); // Re-add placeholder only when truly idle
            }
            this._processQueue(); // Always try to process next item
        } else {
            console.warn(`[Component] _uploadFinished called for unknown or already finished fileId: ${fileId}`);
            if (this.activeUploadCount < 0) this.activeUploadCount = 0; // Safety check
            // Check again if potentially idle after a warning scenario
            if (this.activeUploadCount === 0 && this.uploadQueue.length === 0) {
                this.dispatchEvent(new CustomEvent('all-uploads-complete', { bubbles: true, composed: true }));
                this._addInitialPlaceholder();
            }
        }
    }

    // --- UI Update methods (No changes from your provided code) ---
    _addProgressMessage(fileId, message) {
        this._removeInitialPlaceholder();
        const messageElement = document.createElement('div');
        messageElement.id = fileId;
        messageElement.className = 'progress-message status-waiting';
        messageElement.textContent = message;
        this._progressArea.appendChild(messageElement);
        this._progressArea.scrollTop = this._progressArea.scrollHeight;
    }

    _updateProgressMessage(fileId, message, statusClass = '', errorDetails = null) {
        const messageElement = this.shadowRoot.getElementById(fileId);
        if (messageElement) {
            let errorDiv = messageElement.querySelector('.error-details');
            if (errorDiv) errorDiv.remove();
            messageElement.textContent = message;
            messageElement.className = `progress-message ${statusClass}`;
            if (errorDetails) {
                errorDiv = document.createElement('span');
                errorDiv.className = 'error-details';
                errorDiv.textContent = errorDetails;
                messageElement.appendChild(errorDiv);
            }
            // Scroll only if the element is likely visible or becoming visible
            // This check prevents unnecessary scrolling when updating many hidden messages
            if (this._progressArea.scrollHeight > this._progressArea.clientHeight) {
                this._progressArea.scrollTop = this._progressArea.scrollHeight;
            }
        } else {
            if (!fileId.startsWith('drop-error-')) {
                console.warn(`[Component] Could not find message element for ID: ${fileId}`);
            }
        }
    }

    _addInitialPlaceholder() {
        const hasMessages = this._progressArea.querySelector('.progress-message');
        const placeholderExists = this.shadowRoot.getElementById('initial-placeholder');

        // Add placeholder ONLY if there are no messages AND it doesn't already exist
        if (!hasMessages && !placeholderExists) {
            console.log('[UI] Adding initial placeholder');
            const initialMsg = document.createElement('p');
            initialMsg.id = 'initial-placeholder';
            initialMsg.textContent = 'Drag files or click browse to start uploads.';
            // Prepend instead of append to keep H2 at the top if progress area is flex column
            // this._progressArea.appendChild(initialMsg);
            this._progressArea.insertBefore(initialMsg, this._progressArea.children[1] || null); // Insert after H2
        }
    }

    _removeInitialPlaceholder() {
        const placeholder = this.shadowRoot.getElementById('initial-placeholder');
        if (placeholder) {
            console.log('[UI] Removing initial placeholder');
            placeholder.remove();
        }
    }

    _formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
        if (i >= sizes.length) {
            return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(2)} ${sizes[sizes.length - 1]}`;
        }
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    _escapeHTML(str) {
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// 7. Define the Custom Element (No changes from your provided code)
if (!window.customElements.get('multi-file-upload')) {
    window.customElements.define('multi-file-upload', MultiFileUpload);
} else {
    console.warn('Custom element "multi-file-upload" already defined.');
}