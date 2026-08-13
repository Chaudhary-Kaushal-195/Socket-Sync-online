// ================= FILE HANDLER =================
// Handles file selection, previews, and preparation for upload
// Note: selectedFiles is defined in globals.js

function showFilePreview(files) {
    if (!files || files.length === 0) return;

    // Add to existing array (convert FileList to array)
    Array.from(files).forEach(f => selectedFiles.push(f));

    renderFilePreview();

    // Auto-focus input for caption
    document.getElementById("filePreview").classList.remove("hidden");
    const msgInput = document.getElementById("msgInput");
    if (msgInput) msgInput.focus();
}

function renderFilePreview() {
    const previewList = document.getElementById("previewList");
    if (!previewList) return;

    previewList.innerHTML = "";

    selectedFiles.forEach((file, index) => {
        let contentHtml = "";

        if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            contentHtml = `<img src="${url}" class="preview-thumb">`;
        } else {
            let iconClass = "fas fa-file-alt";
            if (file.type.startsWith("video/")) iconClass = "fas fa-video";
            if (file.type.startsWith("audio/")) iconClass = "fas fa-music";
            if (file.type.includes("pdf")) iconClass = "fas fa-file-pdf";

            contentHtml = `
            <div class="preview-file-icon">
                <i class="${iconClass}"></i>
            </div>`;
        }

        const item = document.createElement("div");
        item.className = "preview-item";
        item.innerHTML = `
            ${contentHtml}
            <div class="preview-name">${file.name}</div>
            <div class="preview-remove" onclick="removeFile(${index})">×</div>
        `;
        previewList.appendChild(item);
    });

    if (selectedFiles.length === 0) {
        document.getElementById("filePreview").classList.add("hidden");
        const fileInputEl = document.getElementById("fileInput");
        if (fileInputEl) fileInputEl.value = "";
    }
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFilePreview();
}

function clearFileSelection() {
    selectedFiles = [];
    const fileInputEl = document.getElementById("fileInput");
    if (fileInputEl) fileInputEl.value = "";

    document.getElementById("filePreview").classList.add("hidden");
    const previewList = document.getElementById("previewList");
    if (previewList) previewList.innerHTML = "";
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
