// ... (Theme toggle as before)
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

function showAlert(message, type = 'danger') {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    container.appendChild(alertDiv);
    setTimeout(() => {
        if (alertDiv) {
            alertDiv.classList.remove('show');
            alertDiv.addEventListener('transitionend', () => alertDiv.remove());
        }
    }, 3000);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hide');
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

    const infoName = document.getElementById("infoName");
    const infoAvatar = document.getElementById("infoAvatar");

    if (infoName) infoName.innerText = chatHeaderTitle.innerText;
    if (infoAvatar) {
        const chatHeaderAvatar = document.getElementById("chatAvatar");
        if (chatHeaderAvatar) infoAvatar.src = chatHeaderAvatar.src;
        infoAvatar.onclick = () => openImageModal(infoAvatar.src, false);
    }

    if (typeof loadChatMedia === 'function') {
        loadChatMedia();
    }
}

// ================= PROFILE MODAL =================
async function openProfileModal() {
    const modal = document.getElementById("profileModal");
    const nameEl = document.getElementById("profileName");
    const idEl = document.getElementById("profileId");
    const avatarEl = document.getElementById("profileAvatar");

    nameEl.innerText = currentUser.name;
    // Show Email instead of UUID for readability, or show both
    idEl.innerText = "Email: " + currentUser.email;
    avatarEl.src = currentUser.avatar;

    // Generate QR (Client-side using API)
    // Data: just the email (user_id) for now
    const qrData = currentUser.email;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
    document.getElementById("myQrCode").src = qrUrl;

    // Fetch Stats
    const streakEl = document.getElementById("statStreak");
    const contactsEl = document.getElementById("statContacts");
    const joinedEl = document.getElementById("statJoined");

    if (streakEl) streakEl.innerText = "--";
    if (contactsEl) contactsEl.innerText = "--";
    if (joinedEl) joinedEl.innerText = "--";

    try {
        // 1. Get Profile (streak, joined)
        const { data: profile } = await supabase
            .from('profiles')
            .select('login_streak, created_at')
            .eq('id', currentUser.user_id)
            .single();

        if (profile) {
            if (streakEl) streakEl.innerText = profile.login_streak || 0;
            if (joinedEl) joinedEl.innerText = new Date(profile.created_at).toLocaleDateString();
        }

        // 2. Get Contacts Count
        const { count } = await supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', currentUser.user_id);

        if (contactsEl) contactsEl.innerText = count || 0;

    } catch (e) {
        console.error("Error loading stats", e);
    }

    modal.classList.remove("hidden");
}

function closeProfileModal() {
    document.getElementById("profileModal").classList.add("hidden");
}

function enlargeQr() {
    const src = document.getElementById("myQrCode").src;
    closeProfileModal();
    openImageModal(src, false, openProfileModal);
}

function enlargeAvatar() {
    const src = document.getElementById("profileAvatar").src;
    closeProfileModal();
    openImageModal(src, false, openProfileModal);
}

function downloadQr() {
    const img = document.getElementById("myQrCode");
    if (img && img.src) {
        // Fetch blob to download because cross-origin taint might block simple <a> download
        fetch(img.src)
            .then(resp => resp.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${currentUser.email}_qr.png`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(() => alert("Could not download QR"));
    }
}

async function shareQr() {
    // Similar to download but navigator.share
    // Skipped for brevity, similar implementation
    alert("Sharing not fully implemented in client-only mode yet.");
}

async function viewStats() {
    // We showed basic stats in modal. Detailed plot is Python-specific.
    // For now just alert or show simple text.
    showAlert("Detailed analytics dashboard is not available in serverless mode yet.", "info");
}

async function openAnalyticsDashboard() {
    showAlert("Analytics Dashboard is currently disabled.", "warning");
}

// Profile Avatar Upload
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('profileAvatarInput');
    if (input) {
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;

            try {
                // Upload using media.js helper if available or manual
                if (typeof uploadFile === 'function') {
                    // We need a profile bucket really, but chat-media is fine
                    const uploaded = await uploadFile(file);

                    if (uploaded.success) {
                        // Update Profile
                        const { error } = await supabase
                            .from('profiles')
                            .update({ avatar: uploaded.file_url })
                            .eq('id', currentUser.user_id);

                        if (!error) {
                            currentUser.avatar = uploaded.file_url;
                            localStorage.setItem("currentUser", JSON.stringify(currentUser));
                            document.getElementById('profileAvatar').src = uploaded.file_url;
                            showAlert("Profile picture updated!", "success");
                        }
                    }
                }
            } catch (e) {
                console.error(e);
                showAlert("Error uploading image", "danger");
            }
        });
    }
});

async function resetProfilePicture() {
    if (!confirm("Reset to default avatar?")) return;
    const defaultUrl = "https://ui-avatars.com/api/?name=" + encodeURIComponent(currentUser.name);

    const { error } = await supabase
        .from('profiles')
        .update({ avatar: defaultUrl })
        .eq('id', currentUser.user_id);

    if (!error) {
        currentUser.avatar = defaultUrl;
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        document.getElementById('profileAvatar').src = defaultUrl;
        showAlert("Profile picture reset.", "success");
    } else {
        showAlert("Failed to reset.", "danger");
    }
}

async function confirmDeleteAccount() {
    alert("Account deletion is not supported in this version. Please contact administrator.");
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
