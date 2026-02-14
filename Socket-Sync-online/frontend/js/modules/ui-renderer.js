// ================= UI RENDERER =================
// Handles DOM updates for messages and chat lists

async function loadMessages(partnerId) {
    if (!messagesBox) return;
    messagesBox.innerHTML = "";

    // Check if we are logged in
    if (!currentUser) return;

    try {
        const { data: msgs, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender.eq.${currentUser.user_id},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${currentUser.user_id})`)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error("Failed to load messages from Supabase", error);
            return;
        }

        // Renormalize if needed (already matches mostly)
        // Adjust for UI expectations if field names differ
        // UI expects: id, from, to, message, file_url, file_type, timestamp
        // DB has: id, sender, receiver, message, file_url, file_type, timestamp
        // We can map it on the fly or adjust UI to use sender/receiver. 
        // Let's map it to keep UI consistent with `handleIncomingMessage` in socket-client.js

        const uiMsgs = msgs.map(m => ({
            id: m.id,
            from: m.sender,
            to: m.receiver,
            message: m.message,
            file_url: m.file_url,
            file_type: m.file_type,
            timestamp: m.timestamp,
            status: m.status,
            is_revoked: m.is_revoked
        }));

        messageCache.set(partnerId, uiMsgs);
        uiMsgs.forEach(m => showMsg(m));

        scrollToBottom();
    } catch (e) {
        console.error("Exception loading messages", e);
    }
}

function showMsg(msg) {
    if (msg.id && document.getElementById(`msg-${msg.id}`)) return;
    if (msg.temp_id && document.querySelector(`[data-temp-id="${msg.temp_id}"]`)) return;

    try {
        const isMe = String(msg.from) === String(currentUser.user_id);
        const div = document.createElement("div");

        // Handle potential string/number types for is_revoked (e.g. "0", 0, "1", 1)
        let isRevoked = false;
        if (msg.is_revoked === true || msg.is_revoked === 1 || msg.is_revoked === "1") {
            isRevoked = true;
        }

        div.className = `msg ${isMe ? "sent" : "recv"}`;

        // Only add media classes if NOT revoked
        if (!isRevoked && msg.file_url) {
            div.classList.add("has-media");
            if (!msg.message) div.classList.add("msg-media");

            // Add specific class for visual media (Image/Video)
            if (msg.file_type && (msg.file_type.startsWith("image") || msg.file_type.startsWith("video"))) {
                div.classList.add("msg-visual");
            }
        }

        div.id = `msg-${msg.id}`;
        div.dataset.id = msg.id;
        if (msg.temp_id) div.dataset.tempId = msg.temp_id;

        // Make message focusable for keyboard navigation
        div.tabIndex = 0;

        const safeMsg = (typeof msg.message === 'string') ? msg.message : "";
        const safeUrl = msg.file_url || "";
        const safeType = msg.file_type || "";


        // Escape quotes AND newlines for the inline JS attribute
        const escapedMsg = safeMsg.replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");

        div.setAttribute("oncontextmenu",
            `handleCtxMenu(event, '${msg.id}', '${escapedMsg}', '${safeUrl}', '${safeType}')`
        );

        let contentHtml = "";

        if (isRevoked) {
            // Revoked Message Style
            contentHtml += `<div class="msg-content" style="color:var(--text-secondary); font-style:italic;">
                <i class="fas fa-ban"></i> ${safeMsg}
            </div>`;
        }
        else {
            if (msg.file_url) {
                try {
                    // renderMediaContent is in media.js or needs to be available globally
                    if (typeof renderMediaContent === 'function') {
                        contentHtml += renderMediaContent(msg);
                    }
                } catch (e) {
                    console.error("Error rendering media", e);
                }
            }
            if (safeMsg !== "") {
                contentHtml += `<div class="msg-content">${linkify(safeMsg)}</div>`;
            }
        }

        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let statusHtml = "";
        if (isMe) {
            let tickClass = "fas fa-check";
            const status = msg.status || "sent";

            if (status === "read") {
                tickClass = "fas fa-check-double read";
            } else if (status === "delivered") {
                tickClass = "fas fa-check-double";
            }

            statusHtml = `<span class="msg-tick"><i class="${tickClass}"></i></span>`;
        }

        div.innerHTML = `
            ${contentHtml}
            <div class="msg-time">
                ${timeStr}
                ${statusHtml}
            </div>
        `;

        messagesBox.appendChild(div);

        // For media messages with text, constrain text width to media width
        if (div.classList.contains('has-media') && safeMsg !== "") {
            const mediaElement = div.querySelector('.chat-image, .chat-video, .chat-audio');
            const textElement = div.querySelector('.msg-content');

            if (mediaElement && textElement) {
                // Wait for image to load to get its actual width
                if (mediaElement.tagName === 'IMG') {
                    if (mediaElement.complete) {
                        textElement.style.maxWidth = mediaElement.offsetWidth + 'px';
                    } else {
                        mediaElement.onload = () => {
                            textElement.style.maxWidth = mediaElement.offsetWidth + 'px';
                        };
                    }
                } else {
                    // For video/audio, set immediately
                    setTimeout(() => {
                        textElement.style.maxWidth = mediaElement.offsetWidth + 'px';
                    }, 10);
                }
            }
        }

        scrollToBottom();

    } catch (err) {
        console.error("Critical error rendering message:", msg, err);
    }
}

function removeMsgFromUI(id) {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
}

function setupChatEvents() {
    const items = document.querySelectorAll(".chat-item");
    items.forEach(item => {
        item.addEventListener("click", () => {
            const userId = item.dataset.id;
            const userName = item.querySelector(".chat-name").innerText;
            const userAvatar = item.querySelector("img").src;
            openChat(userId, userName, userAvatar);
        });
    });
}

function scrollToBottom() {
    if (messagesBox) {
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }
}

// Linkify utility
function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color:var(--accent-color); text-decoration:underline;">${url}</a>`);
}
