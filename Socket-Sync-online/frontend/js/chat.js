// ================= MAIN CHAT LOGIC =================
// API_BASE, socket, currentUser, currentChat, msgQueue, messageCache are in globals.js

// DOM Elements
// DOM Elements (from globals.js: msgInput, messagesBox, fileInputEl)
const ctxMenu = document.getElementById("ctxMenu"); // NOT in globals
let ctxTarget = null; // NOT in globals

// Load User
const storedUser = localStorage.getItem("currentUser");
if (storedUser) {
    currentUser = JSON.parse(storedUser); // Update global
    document.getElementById("me").innerText = currentUser.name;
    socket.emit("join", { room: currentUser.user_id });

    // Load Theme
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        if (typeof updateThemeIcon === 'function') updateThemeIcon(true);
    } else {
        if (typeof updateThemeIcon === 'function') updateThemeIcon(false);
    }

    loadUsers();
} else {
    window.location.href = "/login";
}

// Setup Socket Listeners (from socket-client.js)
setupSocketListeners(socket);

function logout() {
    localStorage.removeItem("currentUser");
    // Also clear queue? Maybe not if we want persistence.
    window.location.href = "/login";
}

// ================= CONTACTS LOGIC =================
function openAddContactModal() {
    const m = document.getElementById("addContactModal");
    if (m) m.classList.remove("hidden");
}

function closeAddContactModal() {
    const m = document.getElementById("addContactModal");
    if (m) m.classList.add("hidden");
}

async function addContact() {
    const input = document.getElementById("newContactId");
    const contactId = input.value.trim();
    if (!contactId) return;

    try {
        const r = await fetch(`${API_BASE}/contacts/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                contact_id: contactId
            })
        });
        const res = await r.json();
        if (res.success) {
            alert("Contact added!");
            closeAddContactModal();
            loadUsers();
        } else {
            alert(res.error || "Failed to add contact");
        }
    } catch (e) {
        console.error(e);
        alert("Error adding contact");
    }
}

// ================= LOAD USERS =================
async function loadUsers() {
    try {
        const r = await fetch(`${API_BASE}/chat-list?user_id=${currentUser.user_id}`);
        const users = await r.json();

        const list = document.getElementById("chatList");
        list.innerHTML = "";

        users.forEach(u => {
            const isUnsaved = !u.is_contact ? `<span style="font-size:0.75em; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:12px; margin-left:8px; border:1px solid var(--border-color); opacity:0.7;">Unsaved</span>` : "";
            const unreadBadge = u.unread_count > 0 ? `<div class="unread-badge">${u.unread_count}</div>` : "";

            const div = document.createElement("div");
            div.className = "chat-item";
            div.id = `chat-item-${u.user_id}`;
            div.dataset.id = u.user_id;

            div.innerHTML = `
                <img src="${u.avatar}">
                <div class="chat-name" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>${u.name} ${isUnsaved}</span>
                    ${unreadBadge}
                </div>
            `;
            list.appendChild(div);
        });

        setupChatEvents(); // from ui-renderer.js

    } catch (e) {
        console.error("Failed to load users", e);
    }
}

// ================= OPEN CHAT =================
function openChat(userId, name, avatar) {
    currentChat = userId;
    currentChatIsContact = true; // Assume true unless specific check (can refine later)

    // UI Helpers
    document.getElementById("emptyChat").classList.add("hidden");
    const chatHeader = document.querySelector(".chat-header:not(#selectionHeader)");
    if (chatHeader) chatHeader.classList.remove("hidden");
    messagesBox.classList.remove("hidden");
    document.querySelector(".input-area").classList.remove("hidden");

    // Update Header
    document.getElementById("chatHeaderTitle").innerText = name;
    document.getElementById("chatAvatar").src = avatar;

    // Contact Save Button Logic
    // Start simple: Hide it unless we know it's unsaved. 
    // For now, loadUsers handles the "Unsaved" tag, but here we just open.
    document.getElementById("saveContactBtn").classList.add("hidden");

    // Mobile Sidebar
    if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.add("hide");
    }

    // Call Helpers
    if (typeof checkBlockStatus === 'function') checkBlockStatus();
    loadMessages(userId); // from ui-renderer.js

    // Join Room for Real-time
    const room = [currentUser.user_id, userId].sort().join("-");
    socket.emit("join", { room: room });

    // Mark as Read
    socket.emit("read_messages", { sender: userId, receiver: currentUser.user_id });

    // Clear Badge
    const chatItem = document.getElementById(`chat-item-${userId}`);
    if (chatItem) {
        const badge = chatItem.querySelector(".unread-badge");
        if (badge) badge.remove();
    }
}

async function saveCurrentContact() {
    if (!currentChat) return;

    try {
        const r = await fetch(`${API_BASE}/contacts/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                contact_id: currentChat
            })
        });
        const res = await r.json();

        if (res.success) {
            showAlert("Contact saved!", "success");
            currentChatIsContact = true; // Update state if tracking
            document.getElementById("saveContactBtn").classList.add("hidden");
            loadUsers();
        } else {
            showAlert(res.error || "Failed to save contact", "danger");
        }
    } catch (e) {
        console.error(e);
        showAlert("Error saving contact", "danger");
    }
}

// ================= SEND =================
async function send() {
    if (!currentChat) return;

    const room = [currentUser.user_id, currentChat].sort().join("-");
    const textMsg = msgInput.value.trim();
    const tempId = Date.now();

    const cacheAndShow = (msgObj) => {
        if (!messageCache.has(currentChat)) {
            messageCache.set(currentChat, []);
        }
        messageCache.get(currentChat).push(msgObj);
        showMsg(msgObj); // from ui-renderer.js
    };

    // 1. Files
    if (selectedFiles.length > 0) {
        if (!socket.connected && !navigator.onLine) {
            showAlert("Cannot upload files while offline", "warning");
            return;
        }

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            let caption = null;
            if (i === 0 && textMsg) caption = textMsg;

            try {
                const uploaded = await uploadFile(file); // media.js

                const payload = {
                    from: currentUser.user_id,
                    to: currentChat,
                    room: room,
                    text: caption,
                    file_url: uploaded.file_url,
                    file_type: uploaded.file_type,
                    temp_id: Date.now() + i
                };

                const msgObj = {
                    id: 0,
                    temp_id: payload.temp_id,
                    from: currentUser.user_id,
                    file_url: uploaded.file_url,
                    file_type: uploaded.file_type,
                    message: caption,
                    timestamp: new Date().toISOString(),
                    status: "sent"
                };

                cacheAndShow(msgObj);
                socket.emit("send_message", payload);

            } catch (e) {
                console.error("File upload failed", e);
                showAlert(`Failed to send ${file.name}`, "danger");
            }
        }

        clearFileSelection(); // file-handler.js
        msgInput.value = "";
    }
    // 2. Text Only
    else if (textMsg !== "") {
        const payload = {
            from: currentUser.user_id,
            to: currentChat,
            room: room,
            text: textMsg,
            temp_id: tempId
        };

        const msgObj = {
            id: 0,
            temp_id: tempId,
            from: currentUser.user_id,
            message: payload.text,
            timestamp: new Date().toISOString(),
            status: "sent"
        };

        cacheAndShow(msgObj);

        if (socket.connected) {
            socket.emit("send_message", payload);
        } else {
            msgQueue.push(payload);
            localStorage.setItem("msgQueue", JSON.stringify(msgQueue));
            console.log("Message queued for offline sending");
            // Offline feedback?
        }

        msgInput.value = "";
    }
}

// Enter Key
msgInput.addEventListener("keypress", e => {
    if (e.key === "Enter") send();
});

// Voice Send
async function sendVoiceMessage(file) {
    if (!currentChat) {
        console.error("No current chat selected");
        return;
    }

    console.log("Starting voice upload...", file);
    try {
        const uploaded = await uploadFile(file); // media.js
        console.log("Voice uploaded:", uploaded);

        const room = [currentUser.user_id, currentChat].sort().join("-");
        const payload = {
            from: currentUser.user_id,
            to: currentChat,
            room: room,
            text: null,
            file_url: uploaded.file_url,
            file_type: "audio/webm",
            temp_id: Date.now()
        };

        const msgObj = {
            id: 0,
            temp_id: payload.temp_id,
            from: currentUser.user_id,
            file_url: uploaded.file_url,
            file_type: "audio/webm",
            message: null,
            timestamp: new Date().toISOString(),
            status: "sent"
        };

        if (!messageCache.has(currentChat)) {
            messageCache.set(currentChat, []);
        }
        messageCache.get(currentChat).push(msgObj);
        showMsg(msgObj);

        console.log("Emitting voice message...", payload);
        socket.emit("send_message", payload);

    } catch (e) {
        console.error("Voice send error:", e);
        showAlert("Failed to send voice message: " + e.message, "danger");
    }
}
window.sendVoiceMessage = sendVoiceMessage;

// ================= CONTEXT MENU & ACTIONS =================
function handleCtxMenu(e, msgId, text, fileUrl, fileType) {
    e.preventDefault();
    e.stopPropagation();
    ctxTarget = { id: msgId, text, fileUrl, fileType };

    const copyTextBtn = document.getElementById("ctxItemCopyText");
    const copyImageBtn = document.getElementById("ctxItemCopyImage");

    if (copyTextBtn) {
        copyTextBtn.classList.toggle("hidden", !(text && text.trim().length > 0));
    }
    if (copyImageBtn) {
        copyImageBtn.classList.toggle("hidden", !(fileUrl && fileType && fileType.startsWith("image")));
    }

    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 160;
    const menuHeight = 200;
    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
    ctxMenu.classList.remove("hidden");
}

document.addEventListener("click", () => {
    if (ctxMenu) ctxMenu.classList.add("hidden");
});

function ctxDelete() {
    ctxMenu.classList.add("hidden");
    if (!ctxTarget || !ctxTarget.id) return;
    document.getElementById("deleteOptionsModal").classList.remove("hidden");

    // Default Hidden
    const btn = document.getElementById("btnDeleteEveryone");
    btn.style.display = "none";

    // Check Permissions
    let isMyMsg = false;
    let isRevoked = false;

    // We need to find the message in cache to check details
    const msgs = messageCache.get(currentChat) || [];
    const m = msgs.find(msg => msg.id == ctxTarget.id);

    if (m) {
        if (String(m.from) === String(currentUser.user_id)) {
            isMyMsg = true;
        }
        if (m.is_revoked) {
            isRevoked = true;
        }
    }

    // Only show if it's MY message AND NOT yet revoked
    if (isMyMsg && !isRevoked) {
        btn.style.display = "block";
    }
}

function closeDeleteModal() {
    document.getElementById("deleteOptionsModal").classList.add("hidden");
}

function cancelDelete() {
    closeDeleteModal();
    isBulkDelete = false;
    ctxTarget = null;
    toggleSelectionMode(); // Exit selection mode if active? Or just keep it?
    // Usually canceling a bulk delete should probably keep selection mode? 
    // But user might want to cancel the whole action. 
    // Let's just close modal for now. If bulk, maybe keep selection.

    // Actually, if I cancel a single delete, I just close modal.
    // If I cancel bulk, I likely want to review selection. So don't toggle mode.
}

let isBulkDelete = false;

async function confirmDelete(type) {
    closeDeleteModal();
    let idsToDelete = isBulkDelete ? Array.from(selectedMessages) : (ctxTarget ? [ctxTarget.id] : []);

    if (idsToDelete.length === 0) return;

    if (type === 'everyone') {
        const room = [currentUser.user_id, currentChat].sort().join("-");
        if (idsToDelete.length > 1) {
            // BULK DELETE
            socket.emit("bulk_delete_message", { ids: idsToDelete, room: room });
        } else {
            // SINGLE DELETE
            socket.emit("delete_message", { id: idsToDelete[0], room: room });
        }
    } else {
        // Delete for Me
        if (idsToDelete.length > 1) {
            // BULK Delete for Me
            socket.emit("bulk_delete_for_me", { ids: idsToDelete, user_id: currentUser.user_id });
            idsToDelete.forEach(id => {
                removeMsgFromUI(id);
                messageCache.forEach(msgs => {
                    const idx = msgs.findIndex(m => m.id == id);
                    if (idx > -1) msgs.splice(idx, 1);
                });
            });
        } else {
            // SINGLE Delete for Me
            const id = idsToDelete[0];
            removeMsgFromUI(id);
            socket.emit("delete_for_me", { id: id, user_id: currentUser.user_id });
            messageCache.forEach(msgs => {
                const idx = msgs.findIndex(m => m.id == id);
                if (idx > -1) msgs.splice(idx, 1);
            });
        }
    }

    if (isBulkDelete) {
        toggleSelectionMode();
        isBulkDelete = false;
    }
    ctxTarget = null;
}

function ctxCopyText() {
    if (ctxTarget && ctxTarget.text) {
        navigator.clipboard.writeText(ctxTarget.text);
    }
    ctxMenu.classList.add("hidden");
}

async function ctxCopyImage() {
    ctxMenu.classList.add("hidden");
    if (ctxTarget && ctxTarget.fileUrl) {
        try {
            let url = ctxTarget.fileUrl;
            if (url.startsWith('/')) url = API_BASE + url;
            const r = await fetch(url);
            const blob = await r.blob();
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            showAlert("Image copied!", "success");
        } catch (err) {
            console.error(err);
        }
    }
}

// ================= FORWARDING =================
function ctxForward() {
    ctxMenu.classList.add("hidden");
    if (!ctxTarget) return;
    showForwardModal();
}

function showForwardModal() {
    const modal = document.getElementById("forwardModal");
    const list = document.getElementById("forwardList");
    list.innerHTML = "<div>Loading...</div>";
    modal.classList.remove("hidden");

    fetch(`${API_BASE}/contacts?user_id=${currentUser.user_id}`) // Reuse contacts endpoint preferred
        .then(r => r.json())
        .then(users => {
            list.innerHTML = "";
            users.forEach(u => {
                list.innerHTML += `
                <div class="chat-item" onclick="confirmForward('${u.user_id}', '${u.name}')">
                    <img src="${u.avatar}">
                    <div class="chat-name">${u.name}</div>
                </div>`;
            });
        });
}

function closeForwardModal() {
    document.getElementById("forwardModal").classList.add("hidden");
}

function confirmForward(userId, name) {
    if (isSelectionMode && selectedMessages.size > 0) {
        bulkForwardExecute(userId, name);
        return;
    }

    if (!ctxTarget) return;

    if (confirm(`Forward message to ${name}?`)) {
        const room = [currentUser.user_id, userId].sort().join("-");
        const payload = {
            from: currentUser.user_id,
            to: userId,
            room: room,
            text: ctxTarget.text,
            file_url: ctxTarget.fileUrl,
            file_type: ctxTarget.fileType
        };
        socket.emit("send_message", payload);
        closeForwardModal();
        showAlert("Message forwarded!", "success");
    }
}

function bulkForwardExecute(userId, name) {
    if (confirm(`Forward ${selectedMessages.size} messages to ${name}?`)) {
        const room = [currentUser.user_id, userId].sort().join("-");
        const chatMsgs = messageCache.get(currentChat) || [];

        selectedMessages.forEach(id => {
            const m = chatMsgs.find(msg => msg.id == id);
            if (m) {
                const payload = {
                    from: currentUser.user_id,
                    to: userId,
                    room: room,
                    text: m.message,
                    file_url: m.file_url,
                    file_type: m.file_type
                };
                socket.emit("send_message", payload);
            }
        });

        closeForwardModal();
        toggleSelectionMode();
        showAlert("Messages forwarded!");
    }
}

// ================= SELECTION MODE & EVENTS =================
let isSelectionMode = false;
let selectedMessages = new Set();

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedMessages.clear();

    const normalHeader = document.querySelector(".chat-header:not(#selectionHeader)");
    const selectHeader = document.getElementById("selectionHeader");
    const msgs = document.querySelectorAll(".msg");

    if (isSelectionMode) {
        if (normalHeader) normalHeader.classList.add("hidden");
        if (selectHeader) selectHeader.classList.remove("hidden");
        updateSelectedCount();
    } else {
        if (normalHeader) normalHeader.classList.remove("hidden");
        if (selectHeader) selectHeader.classList.add("hidden");
        msgs.forEach(m => m.classList.remove("selected"));
    }
}

function updateSelectedCount() {
    document.getElementById("selectedCount").innerText = `${selectedMessages.size} Selected`;
}

function toggleMessageSelect(id) {
    if (!isSelectionMode) return;
    if (selectedMessages.has(id)) {
        selectedMessages.delete(id);
        document.getElementById(`msg-${id}`).classList.remove("selected");
    } else {
        selectedMessages.add(id);
        document.getElementById(`msg-${id}`).classList.add("selected");
    }
    updateSelectedCount();
}

function ctxSelect() {
    if (!ctxTarget || !ctxTarget.id) return;
    if (ctxMenu) ctxMenu.classList.add("hidden");
    if (!isSelectionMode) toggleSelectionMode();
    toggleMessageSelect(parseInt(ctxTarget.id));
}

// Bulk Actions
function bulkDelete() {
    if (selectedMessages.size === 0) return;
    isBulkDelete = true;

    document.getElementById("deleteOptionsModal").classList.remove("hidden");
    const btn = document.getElementById("btnDeleteEveryone");
    btn.style.display = "block"; // Assume yes initially

    const chatMsgs = messageCache.get(currentChat) || [];
    let canDeleteEveryone = true;

    selectedMessages.forEach(id => {
        const m = chatMsgs.find(msg => msg.id == id);
        if (m) {
            // Cannot delete if NOT mine or ALREADY revoked
            if (String(m.from) !== String(currentUser.user_id) || m.is_revoked) {
                canDeleteEveryone = false;
            }
        }
    });

    if (!canDeleteEveryone) {
        btn.style.display = "none";
    }
}

async function bulkCopy() {
    if (selectedMessages.size === 0) return;
    let combinedText = "";
    const chatMsgs = messageCache.get(currentChat) || [];
    selectedMessages.forEach(id => {
        const m = chatMsgs.find(msg => msg.id == id);
        if (m && m.message) combinedText += m.message + "\n";
    });

    if (combinedText) {
        try {
            await navigator.clipboard.writeText(combinedText.trim());
            alert("Copied selected messages!");
        } catch (err) { console.error(err); }
    }
    toggleSelectionMode();
}

function bulkForward() {
    if (selectedMessages.size === 0) return;
    showForwardModal();
}

// Event Delegation for Message Selection
messagesBox.addEventListener('click', (e) => {
    const msgEl = e.target.closest('.msg');
    if (msgEl && isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
        const id = msgEl.dataset.id;
        if (id) toggleMessageSelect(parseInt(id));
    }
});

// ================= BLOCK & CLEAR ACTIONS =================
async function blockUser() {
    if (!currentChat) return;

    try {
        const r = await fetch(`${API_BASE}/user/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blocker: currentUser.user_id,
                blocked: currentChat
            })
        });
        const res = await r.json();

        const btn = document.getElementById("blockBtn");
        if (res.blocked) {
            showAlert("User blocked.", "warning");
            if (btn) btn.innerHTML = '<i class="fas fa-unlock"></i> Unblock User';
        } else {
            showAlert("User unblocked.", "success");
            if (btn) btn.innerHTML = '<i class="fas fa-ban"></i> Block User';
        }
    } catch (e) {
        console.error(e);
        showAlert("Failed to toggle block status", "danger");
    }
}

async function checkBlockStatus() {
    if (!currentChat) return;
    try {
        const r = await fetch(`${API_BASE}/user/block_state?u1=${currentUser.user_id}&u2=${currentChat}`);
        const res = await r.json();
        const btn = document.getElementById("blockBtn");

        if (btn) {
            if (res.state === "blocked_by_me") {
                btn.innerHTML = '<i class="fas fa-unlock"></i> Unblock User';
            } else {
                btn.innerHTML = '<i class="fas fa-ban"></i> Block User';
            }
        }
    } catch (e) {
        console.error("Error checking block status", e);
    }
}

async function clearChat() {
    if (!currentChat) return;
    if (!confirm("Are you sure you want to clear the chat history? This cannot be undone.")) return;

    try {
        // DELETE /chat/<target_id>?u1=...
        const r = await fetch(`${API_BASE}/chat/${currentChat}?u1=${currentUser.user_id}`, {
            method: 'DELETE'
        });
        const res = await r.json();

        if (res.success) {
            showAlert("Chat cleared.", "success");
            loadMessages(currentChat); // Reload (will be empty)
        } else {
            showAlert("Failed to clear chat.", "danger");
        }
    } catch (e) {
        showAlert("Error clearing chat", "danger");
    }
}

// ================= GLOBAL ESC HANDLER =================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = [
            document.getElementById('mediaModal'),
            document.getElementById('carouselModal'),
            document.getElementById('forwardModal'),
            document.getElementById('addContactModal'),
            document.getElementById('profileModal'),
            document.getElementById('deleteOptionsModal')
        ];

        modals.forEach(m => {
            if (m && !m.classList.contains('hidden')) {
                // Specific close functions if needed for cleanup
                if (m.id === 'mediaModal') closeMediaModal();
                else if (m.id === 'carouselModal') closeCarouselModal();
                else if (m.id === 'forwardModal') closeForwardModal();
                else if (m.id === 'addContactModal') closeAddContactModal();
                else if (m.id === 'profileModal') closeProfileModal();
                else if (m.id === 'deleteOptionsModal') closeDeleteModal();
                else m.classList.add('hidden');
            }
        });

        // Also close right sidebar if open (mobile or desktop)
        const rightSidebar = document.getElementById('rightSidebar');
        if (rightSidebar && !rightSidebar.classList.contains('closed')) {
            toggleRightSidebar();
        }

        // Close Context Menu
        if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
            ctxMenu.classList.add('hidden');
        }
    }
});