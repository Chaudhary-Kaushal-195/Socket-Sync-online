// ================= MAIN CHAT LOGIC =================
// API_BASE, socket, currentUser, currentChat, msgQueue, messageCache are in globals.js

// DOM Elements
const ctxMenu = document.getElementById("ctxMenu");
let ctxTarget = null;

// Load User
const storedUser = localStorage.getItem("currentUser");
if (storedUser) {
    window.currentUser = JSON.parse(storedUser);
    currentUser = window.currentUser; // Update local ref if any
    document.getElementById("me").innerText = window.currentUser.name;
    // socket.emit("join") REMOVED

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

// Setup Supabase Realtime
setupSupabaseRealtime();

function logout() {
    supabase.auth.signOut().then(() => {
        localStorage.removeItem("currentUser");
        window.location.href = "/login";
    });
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
    const contactEmail = input.value.trim();
    if (!contactEmail) return;

    try {
        // 1. Find Profile by Email
        const { data: profiles, error: findError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', contactEmail)
            .single();

        if (findError || !profiles) {
            alert("User not found!");
            return;
        }

        const contactUUID = profiles.id;

        // 2. Insert into Contacts
        const { error: insertError } = await supabase
            .from('contacts')
            .insert({
                user_id: currentUser.user_id,
                contact_id: contactUUID
            });

        if (insertError) {
            alert("Failed to add contact: " + insertError.message);
        } else {
            alert("Contact added!");
            closeAddContactModal();
            loadUsers();
        }
    } catch (e) {
        console.error(e);
        alert("Error adding contact");
    }
}

// ================= LOAD USERS =================
async function loadUsers() {
    try {
        const { data: contacts, error } = await supabase
            .from('contacts')
            .select(`
                contact_id,
                profiles:contact_id ( id, name, avatar, user_id )
            `)
            .eq('user_id', currentUser.user_id);

        if (error) throw error;

        const list = document.getElementById("chatList");
        list.innerHTML = "";

        contacts.forEach(c => {
            const p = c.profiles;
            const unreadCount = 0;
            const unreadBadge = unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : "";

            const div = document.createElement("div");
            div.className = "chat-item";
            if (window.onlineUsers && window.onlineUsers.has(p.id)) {
                div.classList.add("online");
            }
            div.id = `chat-item-${p.id}`;
            div.dataset.id = p.id;

            div.innerHTML = `
                <img src="${p.avatar}">
                <div class="chat-name" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>${p.name}</span>
                    ${unreadBadge}
                </div>
            `;
            list.appendChild(div);
        });

        setupChatEvents();

    } catch (e) {
        console.error("Failed to load users", e);
    }
}

// ================= OPEN CHAT =================
function openChat(userId, name, avatar) {
    currentChat = userId;

    document.getElementById("emptyChat").classList.add("hidden");
    const chatHeader = document.querySelector(".chat-header:not(#selectionHeader)");
    if (chatHeader) chatHeader.classList.remove("hidden");
    messagesBox.classList.remove("hidden");
    document.querySelector(".input-area").classList.remove("hidden");

    document.getElementById("chatHeaderTitle").innerText = name;
    document.getElementById("chatAvatar").src = avatar;

    document.getElementById("saveContactBtn").classList.add("hidden");

    if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.add("hide");
    }

    loadMessages(userId);

    // Mark as Read
    supabase.from('messages')
        .update({ status: 'read' })
        .eq('sender', userId)
        .eq('receiver', currentUser.user_id)
        .neq('status', 'read') // Update if NOT read (sent OR delivered)
        .then(() => { });

    const chatItem = document.getElementById(`chat-item-${userId}`);
    if (chatItem) {
        const badge = chatItem.querySelector(".unread-badge");
        if (badge) badge.remove();
    }

    checkBlockStatus();
}

async function saveCurrentContact() {
    // Logic same as addContact but using currentChat
}

// ================= SEND =================
async function send() {
    if (!currentChat) return;

    const textMsg = msgInput.value.trim();
    // We can allow empty text if there is a file
    if (textMsg === "" && selectedFiles.length === 0) return;

    const tempId = Date.now();
    let fileUrl = null;
    let fileType = null;

    // 1. Handle File Upload if any
    if (selectedFiles.length > 0) {
        // For MVP, handle single file or first file if multiple, 
        // to match offline "image with text" capability.
        // Offline code passed file_url/type from separate upload.
        // We will upload here.

        const file = selectedFiles[0]; // Take first
        try {
            // Show some loading state?
            const uploaded = await uploadFile(file); // media.js
            fileUrl = uploaded.file_url;
            fileType = file.type;
        } catch (e) {
            console.error("Upload failed", e);
            showAlert("Failed to upload file", "danger");
            return;
        }
    }

    // 2. Optimistic UI Update
    const msgObj = {
        id: 0,
        temp_id: tempId,
        from: currentUser.user_id,
        to: currentChat, // local expectation
        message: textMsg || null,
        file_url: fileUrl,
        file_type: fileType,
        timestamp: new Date().toISOString(),
        status: "sending",
        is_revoked: false
    };

    if (!messageCache.has(currentChat)) {
        messageCache.set(currentChat, []);
    }
    messageCache.get(currentChat).push(msgObj);
    showMsg(msgObj);
    scrollToBottom();

    // Reset Input
    msgInput.value = "";
    selectedFiles = [];
    document.getElementById("filePreview").classList.add("hidden");
    document.getElementById("previewList").innerHTML = "";

    // 3. Send to Supabase
    try {
        const { error } = await supabase
            .from('messages')
            .insert({
                sender: currentUser.user_id,
                receiver: currentChat,
                message: textMsg || null,
                file_url: fileUrl,
                file_type: fileType,
                status: 'sent'
            });

        if (error) {
            console.error("Send failed", error);
            showAlert("Failed to send message", "danger");
            // Ideally mark message as failed in UI
        }
    } catch (e) {
        console.error("Send exception", e);
    }
}

msgInput.addEventListener("keypress", e => {
    if (e.key === "Enter") send();
});

// Voice Send
async function sendVoiceMessage(file) {
    if (!currentChat) return;

    try {
        const uploaded = await uploadFile(file); // media.js

        const msgObj = {
            id: 0,
            temp_id: Date.now(),
            from: currentUser.user_id,
            to: currentChat,
            file_url: uploaded.file_url,
            file_type: "audio/webm",
            message: null,
            timestamp: new Date().toISOString(),
            status: "sending"
        };

        if (!messageCache.has(currentChat)) messageCache.set(currentChat, []);
        messageCache.get(currentChat).push(msgObj);
        showMsg(msgObj);
        scrollToBottom();

        // DB Insert
        const { error } = await supabase.from('messages').insert({
            sender: currentUser.user_id,
            receiver: currentChat,
            file_url: uploaded.file_url,
            file_type: "audio/webm",
            status: 'sent'
        });

        if (error) throw error;

    } catch (e) {
        console.error("Voice send error:", e);
        showAlert("Failed to send voice message", "danger");
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

    // Boundary check
    const menu = ctxMenu;
    const rect = menu.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    if (x + rect.width > winWidth) x = winWidth - rect.width - 10;
    if (y + rect.height > winHeight) y = winHeight - rect.height - 10;

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

    const btn = document.getElementById("btnDeleteEveryone");
    btn.style.display = "none";

    // Check if I can delete for everyone (only my messages)
    // We need to look up the message to check ownership
    let isMyMsg = false;
    let isRevoked = false;

    const msgs = messageCache.get(currentChat) || [];
    const m = msgs.find(msg => msg.id == ctxTarget.id);

    if (m) {
        // m.from is UUID
        if (m.from === currentUser.user_id) {
            isMyMsg = true;
        }
        if (m.is_revoked) {
            isRevoked = true;
        }
    }

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
}

let isBulkDelete = false;

async function confirmDelete(type) {
    closeDeleteModal();
    let idsToDelete = isBulkDelete ? Array.from(selectedMessages) : (ctxTarget ? [ctxTarget.id] : []);

    if (idsToDelete.length === 0) return;

    if (type === 'everyone') {
        // "Revoke" / "Delete for Everyone"
        // MATCHING OFFLINE BEHAVIOR: Wipe content.

        const updates = {
            message: "🚫 This message was deleted",
            file_url: null,
            file_type: null,
            is_revoked: true
        };

        try {
            const { error } = await supabase
                .from('messages')
                .update(updates)
                .in('id', idsToDelete)
                .eq('sender', currentUser.user_id); // Security check

            if (error) {
                showAlert("Failed to delete for everyone", "danger");
            } else {
                showAlert("Messages deleted", "success");
            }
        } catch (e) {
            console.error(e);
        }

    } else {
        // Delete for Me
        // Since Supabase doesn't have "hidden_for_user" array logic yet without complex table changes,
        // we will implement LOCAL hide for this session + set "deleted_by_sender/receiver" flags if we added them.
        // The offline code had `deleted_by_sender/receiver`.
        // Our schema has them! 

        // We need to determine if I am sender or receiver for EACH message to set correct flag.
        // Bulk update is tricky if mixed.
        // We'll iterate for now or do two queries.

        try {
            // 1. messages where I am sender
            await supabase.from('messages')
                .update({ deleted_by_sender: true })
                .in('id', idsToDelete)
                .eq('sender', currentUser.user_id);

            // 2. messages where I am receiver
            await supabase.from('messages')
                .update({ deleted_by_receiver: true })
                .in('id', idsToDelete)
                .eq('receiver', currentUser.user_id);

            // Remove from UI immediately
            idsToDelete.forEach(id => {
                removeMsgFromUI(id);
                // cache update
                const msgs = messageCache.get(currentChat);
                if (msgs) {
                    const idx = msgs.findIndex(m => m.id == id);
                    if (idx > -1) msgs.splice(idx, 1);
                }
            });

            showAlert("Messages removed from view", "info");

        } catch (e) {
            console.error("Delete for me error", e);
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
            // ... same ...
            let url = ctxTarget.fileUrl;
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

    // Fetch contacts from Supabase
    supabase.from('contacts')
        .select('contact_id, profiles:contact_id(name, avatar, user_id)')
        .eq('user_id', currentUser.user_id)
        .then(({ data, error }) => {
            if (error || !data) {
                list.innerHTML = "Error loading contacts";
                return;
            }
            list.innerHTML = "";
            data.forEach(c => {
                const u = c.profiles;
                list.innerHTML += `
                 <div class="chat-item" onclick="confirmForward('${u.id}', '${u.name}')"> <!-- u.id is UUID -->
                     <img src="${u.avatar}">
                     <div class="chat-name">${u.name}</div>
                 </div>`;
            });
        });
}

function closeForwardModal() {
    document.getElementById("forwardModal").classList.add("hidden");
}

async function confirmForward(userId, name) {
    if (isSelectionMode && selectedMessages.size > 0) {
        bulkForwardExecute(userId, name);
        return;
    }

    if (!ctxTarget) return;

    if (confirm(`Forward message to ${name}?`)) {
        // Insert new message
        const { error } = await supabase.from('messages').insert({
            sender: currentUser.user_id,
            receiver: userId,
            message: ctxTarget.text || null,
            file_url: ctxTarget.fileUrl || null,
            file_type: ctxTarget.fileType || null
        });

        if (!error) {
            closeForwardModal();
            showAlert("Message forwarded!", "success");
        } else {
            showAlert("Forward failed", "danger");
        }
    }
}

async function bulkForwardExecute(userId, name) {
    if (confirm(`Forward ${selectedMessages.size} messages to ${name}?`)) {
        const chatMsgs = messageCache.get(currentChat) || [];

        const inserts = [];
        selectedMessages.forEach(id => {
            const m = chatMsgs.find(msg => msg.id == id);
            if (m) {
                inserts.push({
                    sender: currentUser.user_id,
                    receiver: userId,
                    message: m.message,
                    file_url: m.file_url,
                    file_type: m.file_type
                });
            }
        });

        if (inserts.length > 0) {
            const { error } = await supabase.from('messages').insert(inserts);
            if (!error) {
                closeForwardModal();
                toggleSelectionMode();
                showAlert("Messages forwarded!");
            } else {
                showAlert("Bulk forward failed", "danger");
            }
        }
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
    // Assuming id is string (UUID), convert if using int IDs? 
    // Supabase IDs are UUIDs (strings). Set is fine.
    // toggleMessageSelect(parseInt(ctxTarget.id)); -> parseInt breaks UUID
    toggleMessageSelect(ctxTarget.id);
}

// Bulk Actions
function bulkDelete() {
    if (selectedMessages.size === 0) return;
    isBulkDelete = true;

    document.getElementById("deleteOptionsModal").classList.remove("hidden");
    const btn = document.getElementById("btnDeleteEveryone");
    btn.style.display = "block";

    const chatMsgs = messageCache.get(currentChat) || [];
    let canDeleteEveryone = true;

    selectedMessages.forEach(id => {
        const m = chatMsgs.find(msg => msg.id == id);
        if (m) {
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
        if (id) toggleMessageSelect(id);
    }
});

// ================= BLOCK & CLEAR ACTIONS =================
async function blockUser() {
    if (!currentChat) return;

    try {
        const { data, error } = await supabase
            .from('blocked_users')
            .select('*')
            .eq('blocker_id', currentUser.user_id)
            .eq('blocked_id', currentChat)
            .single();

        if (data) {
            // Unblock
            await supabase.from('blocked_users').delete().eq('blocker_id', currentUser.user_id).eq('blocked_id', currentChat);
            showAlert("User unblocked", "success");
            document.getElementById("blockBtn").innerHTML = '<i class="fas fa-ban"></i> Block User';
        } else {
            // Block
            await supabase.from('blocked_users').insert({
                blocker_id: currentUser.user_id,
                blocked_id: currentChat
            });
            showAlert("User blocked", "warning");
            document.getElementById("blockBtn").innerHTML = '<i class="fas fa-check-circle"></i> Unblock User';
        }

    } catch (e) {
        console.error(e);
        showAlert("Error updating block status", "danger");
    }
}

async function checkBlockStatus() {
    if (!currentChat) return;
    try {
        const { data } = await supabase
            .from('blocked_users')
            .select('*')
            .eq('blocker_id', currentUser.user_id)
            .eq('blocked_id', currentChat)
            .single();

        const btn = document.getElementById("blockBtn");
        if (btn) {
            if (data) {
                btn.innerHTML = '<i class="fas fa-check-circle"></i> Unblock User';
            } else {
                btn.innerHTML = '<i class="fas fa-ban"></i> Block User';
            }
        }
    } catch (e) { }
}

async function clearChat() {
    if (!currentChat) return;
    if (!confirm("Are you sure? This will hide current messages from your view.")) return;

    try {
        // Upsert logic for chat_clear_history
        const { error } = await supabase
            .from('chat_clear_history')
            .upsert({
                user_id: currentUser.user_id,
                partner_id: currentChat,
                cleared_at: new Date().toISOString()
            });

        if (!error) {
            showAlert("Chat history cleared", "info");
            // Clear local cache and UI
            messageCache.set(currentChat, []);
            loadMessages(currentChat); // Reload (will filter by date)
        } else {
            showAlert("Failed to clear chat", "danger");
        }
    } catch (e) {
        console.error(e);
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
                if (m.id === 'mediaModal') closeMediaModal();
                else if (m.id === 'carouselModal') closeCarouselModal();
                else if (m.id === 'forwardModal') closeForwardModal();
                else if (m.id === 'addContactModal') closeAddContactModal();
                else if (m.id === 'profileModal') closeProfileModal();
                else if (m.id === 'deleteOptionsModal') closeDeleteModal();
                else m.classList.add('hidden');
            }
        });

        const rightSidebar = document.getElementById('rightSidebar');
        if (rightSidebar && !rightSidebar.classList.contains('closed')) {
            toggleRightSidebar();
        }

        if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
            ctxMenu.classList.add('hidden');
        }
    }
});
