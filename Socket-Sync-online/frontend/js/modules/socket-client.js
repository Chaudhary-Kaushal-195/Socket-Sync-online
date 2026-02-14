
// ================= SUPABASE REALTIME CLIENT =================

let realtimeChannel = null;

function setupSupabaseRealtime() {
    if (!currentUser) return;

    console.log("Setting up Supabase Realtime for user:", currentUser.user_id);

    // Subscribe to ALL messages where sender or receiver is ME.
    // Row Level Security (RLS) protects the data, but Realtime filters strictly by column value if specified.
    // However, Supabase Realtime 'postgres_changes' filter is limited.
    // Best pattern: Listen to "messages" table public-wide (filter in client? No, insecure/spammy).
    // Better: Listen with a filter. But "OR" filters are hard in Realtime syntax.
    // Workaround: Listen to the whole table, but rely on RLS?
    // NOTE: Realtime by default broadcasts ALL changes to subscribed tables if RLS is not enabled for realtime.
    // If RLS is enabled for realtime (WAL), we need to be authenticated (which we are via supabase-client.js if we set the session).

    // Actually, simple filtering:
    // We can't easily filter "sender=me OR receiver=me".
    // We will listen to the table. RLS *does not* apply to Realtime broadcast stream by default unless "Project Settings > Realtime > Enforce RLS" is on.
    // Assuming RLS is enforced for "select", Realtime might send everything if not careful.
    // For this implementation, we'll implement client-side filtering for simplicity, 
    // assuming the volume isn't massive yet.

    realtimeChannel = supabase
        .channel('public:messages')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'messages' },
            (payload) => {
                handleRealtimeEvent(payload);
            }
        )
        .subscribe((status) => {
            console.log("Supabase Realtime status:", status);
        });
}

function handleRealtimeEvent(payload) {
    const { eventType, new: newRec, old: oldRec } = payload;

    // 1. FILTER: Only care if it involves ME
    // Note: 'newRec' is null for DELETE
    const rec = newRec || oldRec;
    // But oldRec might only have ID if identity is default.
    // If newRec exists, check it.

    if (newRec) {
        // If I am sender or receiver
        // Note: Supabase returns UUIDs for sender/receiver
        // currentUser.user_id is now UUID (from login.js)
        if (newRec.sender !== currentUser.user_id && newRec.receiver !== currentUser.user_id) {
            return;
        }
    }

    if (eventType === 'INSERT') {
        console.log("Realtime INSERT:", newRec);
        handleIncomingMessage(newRec);
    }
    else if (eventType === 'UPDATE') {
        console.log("Realtime UPDATE:", newRec);
        handleMessageUpdate(newRec);
    }
    else if (eventType === 'DELETE') {
        // We might only get ID. 
        if (oldRec && oldRec.id) {
            removeMsgFromUI(oldRec.id);
            // Remove from cache
            messageCache.forEach((msgs, uid) => {
                const idx = msgs.findIndex(m => m.id == oldRec.id);
                if (idx > -1) msgs.splice(idx, 1);
            });
        }
    }
}

function handleIncomingMessage(msg) {
    // Normalization to match UI expectations
    // Supabase returns keys as in DB (e.g. user_id). 
    // UI expects: id, from, to, message, file_url...
    // My DB cols: sender, receiver. Need mapping.

    const normalizedMsg = {
        id: msg.id,
        from: msg.sender,
        to: msg.receiver,
        message: msg.message,
        file_url: msg.file_url,
        file_type: msg.file_type,
        timestamp: msg.timestamp, // ISO string
        status: msg.status,
        is_revoked: msg.is_revoked,
        temp_id: null // Realtime doesn't have temp_id
    };

    // If I sent it, I might have a temp version in UI.
    if (normalizedMsg.from === currentUser.user_id) {
        // It's an echo of my own message.
        // We need to dedupe or replace temp message.
        // Since we don't have temp_id in DB, we can't easily match.
        // However, if we just appended it in send(), we likely have it in cache with id=0.

        // Find in cache by content + approximate timestamp?
        // Or just let it be?
        // If we don't replace, we might have duplicates until refresh.
        // Let's rely on standard deduping by ID, but `send()` added it with `id=0`.

        // Strategy: Look for a message in cache with `id=0` and same content.
        const partnerId = normalizedMsg.to;
        if (messageCache.has(partnerId)) {
            const msgs = messageCache.get(partnerId);
            // Find a temp message (id=0) that matches content
            const tempMatch = msgs.find(m => m.id === 0 && m.message === normalizedMsg.message && m.file_url === normalizedMsg.file_url);
            if (tempMatch) {
                // Update it
                tempMatch.id = normalizedMsg.id;
                tempMatch.timestamp = normalizedMsg.timestamp; // sync server time

                // Update UI
                // We need to find the DOM element. It was rendered with `data-temp-id`.
                // But we don't know the temp_id here! 
                // `send()` generated temp_id. `tempMatch` has `temp_id`.
                const tempId = tempMatch.temp_id;

                const el = document.querySelector(`.msg[data-temp-id="${tempId}"]`);
                if (el) {
                    el.id = `msg-${normalizedMsg.id}`;
                    el.dataset.id = normalizedMsg.id;
                    el.removeAttribute("data-temp-id");
                    const tick = el.querySelector(".msg-tick i");
                    if (tick) tick.className = "fas fa-check"; // Sent

                    // Update context menu handler
                    let oldAttr = el.getAttribute("oncontextmenu");
                    if (oldAttr) {
                        let newAttr = oldAttr.replace(/handleCtxMenu\(event,\s*['"]?(\d+)['"]?/, `handleCtxMenu(event, '${normalizedMsg.id}'`);
                        el.setAttribute("oncontextmenu", newAttr);
                    }
                }
                return; // Done update
            }
        }
    }

    // Add to Cache (if not me-echo handled above, or if I am receiver)
    const partnerId = (normalizedMsg.from === currentUser.user_id) ? normalizedMsg.to : normalizedMsg.from;

    if (!messageCache.has(partnerId)) {
        messageCache.set(partnerId, []);
    }

    // Check duplicate (by ID)
    const validCache = messageCache.get(partnerId);
    if (validCache.find(m => m.id === normalizedMsg.id)) return;

    validCache.push(normalizedMsg);

    // If allowed, play sound for incoming
    if (normalizedMsg.from !== currentUser.user_id) {
        if (typeof playNotificationSound === 'function') playNotificationSound();
    }

    // Update UI if chat open
    if (currentChat === partnerId) {
        showMsg(normalizedMsg); // in ui-renderer.js
        scrollToBottom();

        // Mark as read immediately if I'm looking at it
        if (normalizedMsg.from !== currentUser.user_id) {
            markAsRead(normalizedMsg.id);
        }
    } else {
        // Mark as DELIVERED if not read yet
        if (normalizedMsg.from !== currentUser.user_id && normalizedMsg.status === 'sent') {
            markAsDelivered(normalizedMsg.id);
        }

        // Update badge
        const chatItem = document.getElementById(`chat-item-${partnerId}`);
        if (chatItem) {
            const chatName = chatItem.querySelector(".chat-name");
            let badge = chatItem.querySelector(".unread-badge");
            if (!badge) {
                badge = document.createElement("div");
                badge.className = "unread-badge";
                badge.innerText = "0";
                chatName.appendChild(badge);
            }
            const count = parseInt(badge.innerText) || 0;
            badge.innerText = count + 1;
        }
    }
}

function handleMessageUpdate(msg) {
    // E.g. marked as read, or revoked
    const normalizedMsg = {
        id: msg.id,
        is_revoked: msg.is_revoked,
        status: msg.status
    };

    // Update Cache
    messageCache.forEach(msgs => {
        const local = msgs.find(m => m.id === normalizedMsg.id);
        if (local) {
            local.is_revoked = normalizedMsg.is_revoked;
            local.status = normalizedMsg.status;

            // Update UI
            const el = document.getElementById(`msg-${local.id}`);
            if (el) {
                // 1. Revoked
                if (local.is_revoked) {
                    el.querySelector(".msg-content").innerHTML = `<i class="fas fa-ban"></i> Message revoked`;
                    el.querySelector(".msg-content").style.fontStyle = "italic";
                    el.querySelector(".msg-content").style.color = "var(--text-secondary)";
                    el.classList.remove("has-media", "msg-media");
                    // Remove media elements
                    const mediaEls = el.querySelectorAll(".media-box, .chat-video, .chat-audio, .file-card");
                    mediaEls.forEach(x => x.remove());
                }

                // 2. Status update (ticks)
                if (local.from === currentUser.user_id) {
                    const tick = el.querySelector(".msg-tick i");
                    if (tick) {
                        if (local.status === 'read') tick.className = "fas fa-check-double read";
                        else if (local.status === 'delivered') tick.className = "fas fa-check-double";
                    }
                }
            }
        }
    });
}

function markAsRead(msgId) {
    if (!currentUser) return;
    supabase.from('messages').update({ status: 'read' }).eq('id', msgId).then(res => {
        // console.log("Marked as read", res);
    });
}

function markAsDelivered(msgId) {
    if (!currentUser) return;
    supabase.from('messages')
        .update({ status: 'delivered' })
        .eq('id', msgId)
        .eq('status', 'sent')
        .then(res => {
            console.log("Marked as delivered:", msgId, res);
        });
}

function markAllDelivered() {
    if (!currentUser) {
        console.error("markAllDelivered: No currentUser");
        return;
    }
    console.log("Marking all pending messages as delivered for:", currentUser.user_id);

    // Explicitly select first to see count? Or just update.
    // Update and return count
    supabase.from('messages')
        .update({ status: 'delivered' })
        .eq('receiver', currentUser.user_id)
        .eq('status', 'sent')
        .select() // Return updated rows
        .then(({ data, error }) => {
            if (error) {
                console.error("Sync Error:", error);
                // alert("Sync Error: " + error.message);
            } else {
                console.log("Synced messages:", data.length);
                if (data.length > 0) {
                    // alert(`Synced ${data.length} messages to Delivered!`);
                }
            }
        });
}

function playNotificationSound() {
    // Placeholder
}

// Export for chat.js
window.setupSupabaseRealtime = setupSupabaseRealtime;
window.markAllDelivered = markAllDelivered;
