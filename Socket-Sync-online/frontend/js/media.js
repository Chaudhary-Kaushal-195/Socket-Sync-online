// ================= MEDIA RENDERING =================
function renderMediaContent(msg) {
    let url = msg.file_url;
    if (!url) return "";
    if (url.startsWith("/")) url = API_BASE + url;

    // Fix for quoting in inline handlers
    const safeUrl = url.replace(/'/g, "\\'");

    if (msg.file_type && msg.file_type.startsWith("image")) {
        return `
            <div class="media-box" onclick="openImageModal('${safeUrl}')">
                <img src="${url}" class="chat-image">
            </div>
        `;
    }
    else if (msg.file_type && msg.file_type.startsWith("video")) {
        return `
            <video class="chat-video" onclick="openVideoModal('${safeUrl}')">
                <source src="${url}">
            </video>
        `;
    }
    else if (msg.file_type && msg.file_type.startsWith("audio")) {
        return `<audio controls src="${url}" class="chat-audio"></audio>`;
    }
    else {
        // Generic File
        const filename = url.split('/').pop() || "Attachment";
        return `
            <div class="file-card" onclick="window.open('${safeUrl}', '_blank')">
                <div class="file-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${filename}</div>
                    <span class="file-download-text">Click to download</span>
                </div>
            </div>
        `;
    }
}

// ================= FILE UPLOAD =================

async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: fd
    });

    if (!r.ok) throw new Error("Upload failed");
    return await r.json();
}

// ================= INPUT CHANGE HANDLER =================
// Hook up the hidden input change event
const inputEl = document.getElementById("fileInput");
if (inputEl) {
    inputEl.addEventListener("change", () => {
        if (inputEl.files && inputEl.files.length > 0) {
            showFilePreview(inputEl.files);
        }
    });
}

// ================= PASTE HANDLER =================
window.addEventListener("paste", e => {
    if (!e.clipboardData) return;
    const items = e.clipboardData.items;

    const files = [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
            const file = items[i].getAsFile();
            files.push(file);
        }
    }

    if (files.length > 0) {
        showFilePreview(files);
    }
});

// ================= DRAG & DROP =================
const dragOverlay = document.getElementById("dragOverlay");
let dragCounter = 0;

window.addEventListener("dragenter", e => {
    e.preventDefault();
    dragCounter++;
    dragOverlay?.classList.remove("hidden");
});

window.addEventListener("dragleave", e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        dragOverlay?.classList.add("hidden");
    }
});

window.addEventListener("dragover", e => {
    e.preventDefault();
});

window.addEventListener("drop", e => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay?.classList.add("hidden");

    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        showFilePreview(e.dataTransfer.files);
    }
});

// ================= MEDIA MODAL (VIEWER) =================
// Callback to execute when media modal closes (e.g., reopen profile modal)
let mediaModalCloseCallback = null;

function openImageModal(src, showCarousel = true, onCloseCallback = null) {
    const modal = document.getElementById("mediaModal");
    const img = document.getElementById("modalImage");
    const video = document.getElementById("modalVideo");
    const btn = document.getElementById("btnViewCarousel");

    // Store callback to execute when modal closes
    mediaModalCloseCallback = onCloseCallback;

    if (video) {
        video.pause();
        video.classList.add("hidden");
    }

    img.src = src;
    img.classList.remove("hidden");
    modal.classList.remove("hidden");

    // Carousel Button Logic
    if (btn) {
        if (showCarousel) {
            btn.classList.remove("hidden");
            btn.onclick = () => openCarousel(src);
        } else {
            btn.classList.add("hidden");
        }
    }
}

function openVideoModal(src) {
    const modal = document.getElementById("mediaModal");
    const img = document.getElementById("modalImage");
    const video = document.getElementById("modalVideo");
    const btn = document.getElementById("btnViewCarousel");

    img.classList.add("hidden");
    if (btn) btn.classList.add("hidden"); // No carousel for video focus yet (or filtered out)

    video.src = src;
    video.classList.remove("hidden");
    video.play();

    modal.classList.remove("hidden");
}

function closeMediaModal() {
    const modal = document.getElementById("mediaModal");
    const video = document.getElementById("modalVideo");

    if (video) {
        video.pause();
        video.src = "";
    }
    modal.classList.add("hidden");

    // Execute callback if set (e.g., reopen profile modal)
    if (mediaModalCloseCallback) {
        mediaModalCloseCallback();
        mediaModalCloseCallback = null; // Reset after use
    }
}

// ================= CAROUSEL LOGIC =================
let carouselIndex = 0;
let carouselImages = [];

async function openCarousel(startSrc) {
    // Ensure we have the latest media
    if (!currentChatMedia || currentChatMedia.length === 0) {
        await loadChatMedia();
    }

    // Filter images
    carouselImages = currentChatMedia.filter(m => m.file_type && m.file_type.startsWith("image"));

    if (carouselImages.length === 0) {
        showAlert("No images to display in carousel", "info");
        return;
    }

    // Find start index (handling potential relative/absolute path diffs)
    // startSrc might be full URL, m.file_url might be relative
    carouselIndex = carouselImages.findIndex(m => {
        let url = m.file_url;
        if (url.startsWith('/')) url = API_BASE + url;
        return url === startSrc || startSrc.endsWith(m.file_url);
    });

    if (carouselIndex === -1) carouselIndex = 0;

    renderCarousel();

    document.getElementById("mediaModal").classList.add("hidden"); // Close single viewer
    document.getElementById("carouselModal").classList.remove("hidden");
}

function closeCarouselModal() {
    document.getElementById("carouselModal").classList.add("hidden");
}

function renderCarousel() {
    const container = document.getElementById("carouselItems");
    container.innerHTML = "";

    const msg = carouselImages[carouselIndex];
    let url = msg.file_url;
    if (url.startsWith('/')) url = API_BASE + url;

    // Use Bootstrap 'carousel-item active' structure but we just swap inner content manually for simplicity
    // and full control without Bootstrap JS
    container.innerHTML = `
        <div class="carousel-item active" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center;">
            <img src="${url}" style="max-height: 85vh; max-width: 90%; object-fit: contain; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div class="carousel-caption d-none d-md-block" style="background: rgba(0,0,0,0.6); border-radius: 10px; padding: 10px;">
                <p style="margin:0;">${carouselIndex + 1} / ${carouselImages.length}</p>
                <small>${new Date(msg.timestamp).toLocaleString()}</small>
            </div>
        </div>
    `;
}

function carouselNext() {
    if (carouselImages.length === 0) return;
    carouselIndex = (carouselIndex + 1) % carouselImages.length;
    renderCarousel();
}

function carouselPrev() {
    if (carouselImages.length === 0) return;
    carouselIndex = (carouselIndex - 1 + carouselImages.length) % carouselImages.length;
    renderCarousel();
}

// ================= MEDIA GALLERY (RIGHT SIDEBAR) =================
let currentChatMedia = [];

async function loadChatMedia() {
    if (!currentChat) return;

    try {
        const r = await fetch(`${API_BASE}/chat/${currentChat}/media?u1=${currentUser.user_id}`);
        const media = await r.json();
        currentChatMedia = media;

        // Update Count
        const countEl = document.getElementById("mediaCount");
        if (countEl) countEl.innerText = `${media.length} >`;

        // Update Preview (First 3 images)
        const previewBox = document.getElementById("mediaPreview");
        if (previewBox) {
            previewBox.innerHTML = "";
            const images = media.filter(m => m.file_type && m.file_type.startsWith("image")).slice(0, 3);
            images.forEach(m => {
                let url = m.file_url;
                if (url.startsWith('/')) url = API_BASE + url;
                previewBox.innerHTML += `<img src="${url}">`;
            });
        }
    } catch (e) {
        console.error("Failed to load chat media", e);
    }
}

function openMediaGallery() {
    const overlay = document.getElementById("galleryOverlay");
    if (overlay) overlay.classList.remove("hidden");
    switchTab('media');
}

function closeMediaGallery() {
    document.getElementById("galleryOverlay").classList.add("hidden");
}

function switchTab(tab) {
    // UI Tabs
    document.querySelectorAll(".gallery-tabs .tab").forEach(t => t.classList.remove("active"));
    const activeTab = Array.from(document.querySelectorAll(".gallery-tabs .tab")).find(t => t.innerText.toLowerCase().includes(tab));
    if (activeTab) activeTab.classList.add("active");

    const content = document.getElementById("galleryContent");
    content.innerHTML = "";

    if (tab === 'media') {
        const visualMedia = currentChatMedia.filter(m => m.file_type && (m.file_type.startsWith("image") || m.file_type.startsWith("video")));
        if (visualMedia.length === 0) {
            content.innerHTML = "<div style='width:100%; text-align:center; margin-top:50px; opacity:0.6;'>No media found</div>";
            return;
        }

        visualMedia.forEach(m => {
            let url = m.file_url;
            if (url.startsWith('/')) url = API_BASE + url;

            let itemHtml = "";
            if (m.file_type.startsWith("image")) {
                itemHtml = `<img src="${url}" onclick="openImageModal('${url}')">`;
            } else {
                itemHtml = `<video src="${url}" onclick="openVideoModal('${url}')"></video>`;
            }

            content.innerHTML += `<div class="gallery-item">${itemHtml}</div>`;
        });

    } else if (tab === 'docs') {
        const docs = currentChatMedia.filter(m => m.file_type && !m.file_type.startsWith("image") && !m.file_type.startsWith("video"));
        if (docs.length === 0) {
            content.innerHTML = "<div style='width:100%; text-align:center; margin-top:50px; opacity:0.6;'>No documents found</div>";
            return;
        }

        docs.forEach(m => {
            let url = m.file_url;
            if (url.startsWith('/')) url = API_BASE + url;
            const name = url.split('/').pop();

            content.innerHTML += `
            <div class="doc-row" onclick="window.open('${url}', '_blank')">
                <i class="fas fa-file-alt" style="font-size:24px; color:var(--accent-color); margin-right:15px;"></i>
                <div style="flex:1; overflow:hidden;">
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">${name}</div>
                    <div style="font-size:0.75rem; opacity:0.7;">${formatTime12(m.timestamp)}</div>
                </div>
            </div>`;
        });
    }
}

// ================= RECORDING LOGIC =================
let mediaRecorder = null;
let audioChunks = [];
let recordInterval;

async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert("Microphone access is not supported in this browser.", "warning");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.start();

        // UI
        document.getElementById("recordingOverlay").classList.remove("hidden");
        startTimer();

    } catch (err) {
        console.error("Mic Error:", err);
        showAlert("Could not access microphone.", "danger");
    }
}

function stopRecording() {
    return new Promise(resolve => {
        if (!mediaRecorder) { resolve(null); return; }

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stopTimer();
            // Stop all tracks
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            mediaRecorder = null;
            resolve(audioBlob);
        };

        mediaRecorder.stop();
    });
}

function cancelRecording() {
    if (mediaRecorder) {
        // Stop but don't resolve
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
    }
    stopTimer();
    document.getElementById("recordingOverlay").classList.add("hidden");
}

async function stopAndSendRecording() {
    try {
        const blob = await stopRecording();
        document.getElementById("recordingOverlay").classList.add("hidden"); // Hide immediately
        if (blob) {
            const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });

            if (typeof sendVoiceMessage === "function") {
                sendVoiceMessage(file);
            } else {
                console.error("sendVoiceMessage function missing");
                showAlert("Send function missing", "danger");
            }
        }
    } catch (e) {
        console.error("Error stopping recording:", e);
        showAlert("Failed to stop recording", "danger");
        cancelRecording(); // Reset UI
    }
}

function startTimer() {
    let seconds = 0;
    const el = document.getElementById("recordTimer");
    el.innerText = "00:00";
    clearInterval(recordInterval);
    recordInterval = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        el.innerText = `${m}:${s}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(recordInterval);
    const el = document.getElementById("recordTimer");
    if (el) el.innerText = "00:00";
}




function formatTime12(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Expose functions to window for HTML onclick handlers
window.startRecording = startRecording;
window.stopAndSendRecording = stopAndSendRecording;
window.cancelRecording = cancelRecording;
