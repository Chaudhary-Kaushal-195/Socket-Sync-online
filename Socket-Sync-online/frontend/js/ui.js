// ================= THEME TOGGLE =================
function toggleTheme() {
    document.body.classList.toggle("light-mode");
    const isLight = document.body.classList.contains("light-mode");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    updateThemeIcon(isLight);
}

function updateThemeIcon(isLight) {
    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.className = isLight ? "fas fa-sun logout-btn" : "fas fa-moon logout-btn";
    }
}

// ================= BOOTSTRAP ALERTS =================
function showAlert(message, type = 'danger') {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    container.appendChild(alertDiv);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
        // Bootstrap 5 dismiss via JS or manual remove
        if (alertDiv) {
            alertDiv.classList.remove('show');
            alertDiv.addEventListener('transitionend', () => alertDiv.remove());
        }
    }, 3000);
}

// ================= SIDEBAR & PROFILE UI =================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hide');

    // Fix for chat area not expanding
    const chatArea = document.getElementById('chatArea');

    // On mobile, sidebar overlaps. On Desktop, it shifts.
    // CSS handles width transition if we just toggle class.
}

function toggleRightSidebar() {
    const sidebar = document.getElementById("rightSidebar");
    const isClosed = sidebar.classList.contains("closed");

    if (isClosed) {
        sidebar.classList.remove("closed");
        updateRightSidebarInfo();
    } else {
        sidebar.classList.add("closed");
    }
}

function updateRightSidebarInfo() {
    if (!currentChat) return;

    // Set Header Info
    const infoName = document.getElementById("infoName");
    const infoAvatar = document.getElementById("infoAvatar");

    if (infoName) infoName.innerText = chatHeaderTitle.innerText;
    if (infoAvatar) {
        const chatHeaderAvatar = document.getElementById("chatAvatar");
        if (chatHeaderAvatar) infoAvatar.src = chatHeaderAvatar.src;
        infoAvatar.style.cursor = "pointer";
        infoAvatar.onclick = () => openImageModal(infoAvatar.src, false);
    }

    // Fetch Media Count & Previews
    if (typeof loadChatMedia === 'function') {
        loadChatMedia();
    }

    // Check Block Status
    if (typeof checkBlockStatus === 'function') {
        checkBlockStatus();
    }
}

// ================= PROFILE MODAL =================
function openProfileModal() {
    const modal = document.getElementById("profileModal");
    const nameEl = document.getElementById("profileName");
    const idEl = document.getElementById("profileId");
    const avatarEl = document.getElementById("profileAvatar");

    nameEl.innerText = currentUser.name;
    idEl.innerText = "ID: " + currentUser.user_id; // Using user_id
    avatarEl.src = currentUser.avatar;

    // Generate/Fetch QR
    fetch(`${API_BASE}/user/${currentUser.user_id}/qr`)
        .then(r => r.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            document.getElementById("myQrCode").src = url;
        });

    // Fetch Profile Stats
    const streakEl = document.getElementById("statStreak");
    const contactsEl = document.getElementById("statContacts");
    const joinedEl = document.getElementById("statJoined");

    if (streakEl) streakEl.innerText = "--";
    if (contactsEl) contactsEl.innerText = "--";
    if (joinedEl) joinedEl.innerText = "--";

    fetch(`${API_BASE}/user/${currentUser.user_id}/stats`)
        .then(r => r.json())
        .then(stats => {
            if (streakEl) streakEl.innerText = stats.streak;
            if (contactsEl) contactsEl.innerText = stats.contacts;
            if (joinedEl) joinedEl.innerText = stats.joined || "N/A";
        })
        .catch(err => {
            console.error("Error loading stats:", err);
            if (joinedEl) joinedEl.innerText = "N/A";
        });

    modal.classList.remove("hidden");
}

function closeProfileModal() {
    document.getElementById("profileModal").classList.add("hidden");
}

function enlargeQr() {
    const src = document.getElementById("myQrCode").src;
    closeProfileModal();
    // Pass callback to reopen profile modal when image preview closes
    openImageModal(src, false, openProfileModal);
}

function enlargeAvatar() {
    const src = document.getElementById("profileAvatar").src;
    closeProfileModal();
    // Pass callback to reopen profile modal when image preview closes
    openImageModal(src, false, openProfileModal);
}

function downloadQr() {
    const img = document.getElementById("myQrCode");
    if (img && img.src) {
        const a = document.createElement("a");
        a.href = img.src;
        // Updated filename format: username_Socket-Sync_qr
        // Assuming currentUser.name or currentUser.user_id determines "username".
        // Use user_id as it is unique and what was requested "username_Socket-Sync_qr" usually implies the identifier.
        // User said "username", but code uses user_id for IDs. Let's use user_id to be safe or name if preferred.
        // Plan said: `${currentUser.user_id}_Socket-Sync_qr.png`
        a.download = `${currentUser.user_id}_Socket-Sync_qr.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

async function shareQr() {
    const img = document.getElementById("myQrCode");
    if (!img || !img.src) return;

    try {
        const response = await fetch(img.src);
        const blob = await response.blob();
        // Updated filename format
        const filename = `${currentUser.user_id}_Socket-Sync_qr.png`;
        const file = new File([blob], filename, { type: "image/png" });

        if (navigator.share) {
            await navigator.share({
                title: 'My Socket-Sync QR Code',
                text: 'Scan this to chat with me on Socket-Sync!',
                files: [file]
            });
        } else {
            showAlert("Sharing is not supported on this browser/device.", "warning");
        }
    } catch (err) {
        console.error("Error sharing QR:", err);
        showAlert("Failed to share QR code.", "danger");
    }
}



async function viewStats() {
    try {
        // Show loading or reuse openImageModal with placeholder
        const r = await fetch(`${API_BASE}/stats`);
        const data = await r.json();

        if (data.plot_url) {
            let url = data.plot_url;
            if (url.startsWith("/")) url = API_BASE + url;

            // Open in full screen modal (no carousel for stats)
            closeProfileModal();
            // Pass callback to reopen profile modal when stats image closes
            openImageModal(url, false, openProfileModal);

            // Ideally we could show text stats too, but image covers the syllabus requirement
        } else {
            showAlert("Could not generate stats", "warning");
        }
    } catch (e) {
        console.error(e);
        showAlert("Failed to load statistics", "danger");
    }
}

async function openAnalyticsDashboard() {
    try {
        showAlert("Checking dashboard status...", "info");

        const r = await fetch(`${API_BASE}/start-dashboard`, { method: "POST" });
        const data = await r.json();

        if (r.ok) {
            if (data.status === "started") {
                showAlert("Dashboard launching... Please wait.", "success");
                // Give it a moment to boot up
                setTimeout(() => {
                    window.open("http://localhost:8501", "_blank");
                }, 3000);
            } else {
                // Already running
                window.open("http://localhost:8501", "_blank");
            }
        } else {
            showAlert("Failed to start dashboard: " + (data.error || "Unknown error"), "danger");
        }
    } catch (e) {
        console.error(e);
        showAlert("Error connecting to server", "danger");
    }
}

// Profile Avatar Upload Listener
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('profileAvatarInput');
    if (input) {
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;

            // 1. Upload File
            const formData = new FormData();
            formData.append('file', file);

            try {
                // Show loading state?
                document.getElementById('profileAvatar').style.opacity = '0.5';

                const r = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await r.json();

                if (data.file_url) {
                    let newAvatarUrl = data.file_url;
                    if (newAvatarUrl.startsWith("/")) newAvatarUrl = API_BASE + newAvatarUrl;

                    // 2. Update DB
                    const uRes = await fetch(`${API_BASE}/user/avatar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: currentUser.user_id,
                            avatarUrl: newAvatarUrl
                        })
                    });

                    if (uRes.ok) {
                        // 3. Update Local State & UI
                        currentUser.avatar = newAvatarUrl;
                        localStorage.setItem("currentUser", JSON.stringify(currentUser));

                        document.getElementById('profileAvatar').src = newAvatarUrl;
                        showAlert("Profile picture updated!", "success");
                    } else {
                        showAlert("Failed to update profile.", "danger");
                    }
                }
            } catch (e) {
                console.error(e);
                showAlert("Error uploading image", "danger");
            } finally {
                document.getElementById('profileAvatar').style.opacity = '1';
            }
        });
    }
});

async function resetProfilePicture() {
    if (!confirm("Remove profile picture and reset to default?")) return;

    // Generate default
    const defaultUrl = "https://ui-avatars.com/api/?name=" + encodeURIComponent(currentUser.name);

    try {
        const uRes = await fetch(`${API_BASE}/user/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.user_id,
                avatarUrl: defaultUrl
            })
        });

        if (uRes.ok) {
            // Update Local
            currentUser.avatar = defaultUrl;
            localStorage.setItem("currentUser", JSON.stringify(currentUser));

            // Update UI
            document.getElementById('profileAvatar').src = defaultUrl;
            showAlert("Profile picture reset.", "success");
        } else {
            showAlert("Failed to reset avatar.", "danger");
        }
    } catch (e) {
        console.error(e);
        showAlert("Error resetting avatar", "danger");
    }
}

async function confirmDeleteAccount() {
    const confirmed1 = confirm("⚠️ CRITICAL WARNING!\n\nAre you sure you want to PERMANENTLY DELETE your account?\n\nThis will remove:\n- All your messages\n- Your contact list\n- Your profile details\n- Your login streak\n\nThis action CANNOT be undone.");

    if (confirmed1) {
        const confirmed2 = confirm("FINAL CONFIRMATION:\n\nAre you absolutely sure? All your data will be wiped from our database forever.");
        if (confirmed2) {
            try {
                const response = await fetch(`${API_BASE}/user/delete`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.user_id })
                });

                const data = await response.json();

                if (data.success) {
                    alert("Your account and all associated data have been permanently deleted.");
                    logout(); // Call existing logout function to clear storage and redirect
                } else {
                    showAlert("Failed to delete account: " + (data.error || "Unknown error"), "danger");
                }
            } catch (err) {
                console.error("Error deleting account:", err);
                showAlert("A server error occurred while trying to delete your account.", "danger");
            }
        }
    }
}

// ================= GLOBAL EVENT LISTENERS (Modals) =================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Handle "Click Outside" to Close
    const modalIds = ["profileModal", "mediaModal", "forwardModal"];

    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener("click", (e) => {
                // If the user clicks the Backdrop (the modal div itself), close it.
                // Children (like .auth-box) prevent propagation or are different targets.
                if (e.target === modal) {
                    modal.classList.add("hidden");

                    // Specific cleanup if needed (e.g. stop video)
                    if (id === "mediaModal") {
                        const v = document.getElementById("modalVideo");
                        if (v) { v.pause(); v.src = ""; }
                    }
                }
            });
        }
    });

    // 2. Handle "Escape" Key to Close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            // Close Modals
            modalIds.forEach(id => {
                const m = document.getElementById(id);
                if (m && !m.classList.contains("hidden")) {
                    m.classList.add("hidden");

                    if (id === "mediaModal") {
                        const v = document.getElementById("modalVideo");
                        if (v) { v.pause(); v.src = ""; }
                    }
                }
            });

            // Close Gallery Overlay
            const gallery = document.getElementById("galleryOverlay");
            if (gallery && !gallery.classList.contains("hidden")) {
                gallery.classList.add("hidden");
            }

            // Close Right Sidebar (optional, but good UX)
            const rightSidebar = document.getElementById("rightSidebar");
            if (rightSidebar && !rightSidebar.classList.contains("closed")) {
                rightSidebar.classList.add("closed");
            }
        }
    });
});


function scrollToBottom() {
    const messagesBox = document.getElementById("messages");
    if (messagesBox) {
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }
}
