// ================= SOCKET CLIENT =================
// Handles all incoming socket events

function setupSocketListeners(socket) {

    // Connect / Queue Flush
    socket.on("connect_error", (err) => {
        console.error("SOCKET CONNECT ERROR:", err.message, err);
    });

    socket.on("connect", () => {
        console.log("SOCKET CONNECTED:", socket.id);
        const user = JSON.parse(localStorage.getItem("user"));
        if (typeof msgQueue !== 'undefined' && msgQueue.length > 0) {
            console.log(`Flushing ${msgQueue.length} messages`);
            msgQueue.forEach(payload => {
                socket.emit("send_message", payload);
            });
            msgQueue = [];
            localStorage.setItem("msgQueue", "[]");
        }
    });

    // Message Sent Confirmation (Update Temp ID to Real ID)
    socket.on("message_sent_confirm", data => {
        const tempId = data.temp_id;
        const realId = data.id;

        const el = document.querySelector(`.msg[data-temp-id="${tempId}"]`);
        if (el) {
            el.id = `msg-${realId}`;
            el.dataset.id = realId;

            const tick = el.querySelector(".msg-tick i");
            if (tick) tick.className = "fas fa-check";

            // Update context menu handler with real ID
            let oldAttr = el.getAttribute("oncontextmenu");
            if (oldAttr) {
                let newAttr = oldAttr.replace(/handleCtxMenu\(event,\s*\d+/, `handleCtxMenu(event, ${realId}`);
                el.setAttribute("oncontextmenu", newAttr);
            }
        }

        if (currentChat && messageCache.has(currentChat)) {
            const msgs = messageCache.get(currentChat);
            const target = msgs.find(m => m.temp_id == tempId);
            if (target) {
                target.id = realId;
                target.status = "sent";
            }
        }
    });

    // Receive Message
    socket.on("receive_message", m => {
        console.log("RECEIVED MSG:", m, "CURRENT USER:", currentUser.user_id);
        const chatPartner = m.from;

        if (!messageCache.has(chatPartner)) {
            messageCache.set(chatPartner, []);
        }
        const msgs = messageCache.get(chatPartner);

        // Deduplicate
        if (msgs.some(existing => existing.id === m.id)) {
            return;
        }

        msgs.push(m);

        if (
            chatPartner === currentChat &&
            m.to === currentUser.user_id
        ) {
            showMsg(m);
            // If chat is open, it's read
            socket.emit("read_messages", { sender: chatPartner, receiver: currentUser.user_id });
        } else {
            // Delivered but UNREAD
            if (m.to === currentUser.user_id) {
                socket.emit("delivery_receipt", { msg_id: m.id, sender: m.from, receiver: currentUser.user_id });

                // Update UI Badge
                const chatItem = document.getElementById(`chat-item-${m.from}`);
                if (chatItem) {
                    // Prevent duplicate badge count for the same message
                    const badgeKey = `processed-${m.id}`;
                    if (window[badgeKey]) return;
                    window[badgeKey] = true;

                    const chatName = chatItem.querySelector(".chat-name");
                    let badge = chatItem.querySelector(".unread-badge");
                    if (!badge) {
                        badge = document.createElement("div");
                        badge.className = "unread-badge";
                        badge.innerText = "0";
                        if (chatName) chatName.appendChild(badge);
                        else chatItem.appendChild(badge);
                    }
                    const count = parseInt(badge.innerText) || 0;
                    badge.innerText = count + 1;
                }
            }
        }
    });

    // Message Delivered Receipt
    socket.on("message_delivered", data => {
        applyDeliveryToUI(data.id);
    });

    // Bulk Message Delivered Receipt
    socket.on("bulk_message_delivered", data => {
        if (data.ids && Array.isArray(data.ids)) {
            data.ids.forEach(id => {
                applyDeliveryToUI(id);
            });
        }
    });

    function applyDeliveryToUI(id) {
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            const tick = el.querySelector(".msg-tick i");
            if (tick && !tick.classList.contains("read")) {
                tick.className = "fas fa-check-double"; // Double Gray
            }
        }

        messageCache.forEach(msgs => {
            const target = msgs.find(m => m.id == id);
            if (target && target.status !== "read") {
                target.status = "delivered";
            }
        });
    }

    // Message Read Receipt
    socket.on("messages_read", data => {
        const partnerId = data.by;

        if (partnerId === currentChat) {
            const myMsgs = document.querySelectorAll(".msg.sent .msg-tick i");
            myMsgs.forEach(icon => {
                icon.className = "fas fa-check-double read";
            });
        }

        if (messageCache.has(partnerId)) {
            messageCache.get(partnerId).forEach(m => {
                if (m.from === currentUser.user_id) {
                    m.status = "read";
                }
            });
        }
    });

    // Message Revoked
    socket.on("message_revoked", data => {
        applyRevocationToUI(data.id, data.message);
    });

    // Bulk Message Revoked
    socket.on("bulk_message_revoked", data => {
        if (data.ids && Array.isArray(data.ids)) {
            data.ids.forEach(id => {
                applyRevocationToUI(id, data.message);
            });
        }
    });

    function applyRevocationToUI(id, message) {
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            el.classList.remove("has-media", "msg-media");

            const mediaSelectors = [".media-box", ".chat-video", ".chat-audio", ".file-card"];
            mediaSelectors.forEach(selector => {
                const mediaEl = el.querySelector(selector);
                if (mediaEl) mediaEl.remove();
            });

            let contentDiv = el.querySelector(".msg-content");
            if (!contentDiv) {
                contentDiv = document.createElement("div");
                contentDiv.className = "msg-content";
                const timeDiv = el.querySelector(".msg-time");
                el.insertBefore(contentDiv, timeDiv);
            }

            contentDiv.innerHTML = `<i class="fas fa-ban"></i> ${message}`;
            contentDiv.style.color = "var(--text-secondary)";
            contentDiv.style.fontStyle = "italic";
        }

        messageCache.forEach(msgs => {
            const target = msgs.find(m => m.id == id);
            if (target) {
                target.message = message;
                target.file_url = null;
                target.is_revoked = 1;
            }
        });
    }

    // Message Deleted (Hard delete or soft delete for me)
    socket.on("message_deleted", data => {
        removeMsgFromUI(data.id);
    });

    socket.on("bulk_message_deleted", data => {
        if (data.ids && Array.isArray(data.ids)) {
            data.ids.forEach(id => {
                removeMsgFromUI(id);
            });
        }
    });

    socket.on("error", data => {
        alert(data.message);
    });
}
