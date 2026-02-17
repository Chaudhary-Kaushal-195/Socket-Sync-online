// ================= AUTH CHECK & INIT =================
window.onload = () => {
    const u = localStorage.getItem("currentUser");
    if (!u) {
        window.location.href = "/login";
        return;
    }

    currentUser = JSON.parse(u);
    const meEl = document.getElementById("me");
    if (meEl) meEl.innerText = currentUser.name;

    loadUsers();

    // Load Theme
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }

    // Join Personal Room for Signaling
    socket.emit("join", { room: currentUser.user_id });
};

// ================= LOGOUT =================
function logout() {
    localStorage.removeItem("currentUser");
    // Also clear queue? Maybe not if we want persistence.
    window.location.href = "/login";
}

// ================= LOAD USERS (CHAT LIST) =================
async function loadUsers() {
    try {
        const r = await fetch(`${API_BASE}/chat-list?user_id=${currentUser.user_id}`);
        const users = await r.json();

        chatList.innerHTML = "";

        if (!users || users.length === 0) {
            chatList.innerHTML = `
                <div style="text-align:center; padding:20px; color:var(--text-secondary);">
                    <p>No chats yet.</p>
                    <p style="font-size:0.8rem;">Click + to start a new chat.</p>
                </div>
            `;
            return;
        }

        users.forEach(u => {
            // Pass is_contact flag to openChat
            const safeName = u.name.replace(/'/g, "\\'");
            const safeAvatar = u.avatar.replace(/'/g, "\\'");

            chatList.innerHTML += `
        <div class="chat-item" id="chat-item-${u.user_id}"
             onclick="openChat('${u.user_id}','${safeName}','${safeAvatar}', ${u.is_contact})">
            <img src="${u.avatar}" 
                 onclick="event.stopPropagation(); openImageModal(this.src, false)" 
                 style="cursor: pointer;">
            <div class="chat-name">
                ${u.name}
                ${u.is_contact === 0 ? '<span style="font-size:0.7rem; color: #ff9800; margin-left:5px;">(Unsaved)</span>' : ''}
            </div>
            ${u.unread_count > 0 ? `<div class="unread-badge">${u.unread_count}</div>` : ''}
        </div>`;
        });
    } catch (e) {
        console.warn("Could not load contacts", e);
        chatList.innerHTML = `<div style="text-align:center; padding:10px;">Offline</div>`;
    }
}

// ================= ADD CONTACT =================
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
            showAlert("Contact added!", "success");
            closeAddContactModal();
            input.value = "";
            loadUsers(); // Refresh list
        } else {
            showAlert(res.error || "Failed to add contact", "danger");
        }
    } catch (e) {
        console.error(e);
        showAlert("Error adding contact", "danger");
    }
}
