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

// ================= QR TOGGLE =================
async function toggleQrType() {
    const img = document.getElementById("myQrCode");
    const btn = document.getElementById("qrToggleBtn");
    const title = document.getElementById("qrTitle");
    const desc = document.getElementById("qrDesc");

    console.log("Toggling QR. Current state (LoginQR?):", window.showingLoginQr);

    if (!window.showingLoginQr) {
        // Switch to Login QR
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
            showAlert("Session not found", "danger");
            return;
        }

        console.log("Generating SESSION QR...");

        const qrPayload = {
            type: 'session',
            rt: data.session.refresh_token,
            at: data.session.access_token
        };
        const qrData = JSON.stringify(qrPayload);
        // Add timestamp to prevent caching
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData)}&time=${Date.now()}`;

        img.src = qrUrl;

        btn.innerText = "Show Profile QR";
        if (title) title.innerText = "Login QR (Secure - DO NOT SHARE)";
        if (desc) desc.innerText = "Scan to login instantly";

        // Visual feedback
        img.style.border = "2px solid #ff4444";

        window.showingLoginQr = true;
    } else {
        // Switch back to Profile QR
        console.log("Generating PROFILE QR...");

        const qrPayload = {
            type: 'profile',
            email: currentUser.email
        };
        const qrData = JSON.stringify(qrPayload);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}&time=${Date.now()}`;

        img.src = qrUrl;

        btn.innerText = "Show Login QR (Secure)";
        if (title) title.innerText = "Profile QR Code";
        if (desc) desc.innerText = "Scan to share contact";

        img.style.border = "none";

        window.showingLoginQr = false;
    }
}

async function downloadQr() {
    const img = document.getElementById("myQrCode");
    if (!img || !img.src) return;

    try {
        // Fetch the image to force download
        const response = await fetch(img.src);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = window.showingLoginQr ? "socket-sync-login-qr.png" : "socket-sync-profile-qr.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);

    } catch (e) {
        console.error("QR Download Error", e);
        // Fallback: Open in new tab
        window.open(img.src, '_blank');
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
    // Reset QR State
    window.showingLoginQr = false;
    const qrToggleBtn = document.getElementById("qrToggleBtn");
    const qrTitle = document.getElementById("qrTitle");
    const qrDesc = document.getElementById("qrDesc");

    if (qrToggleBtn) qrToggleBtn.innerText = "Show Login QR (Secure)";
    if (qrTitle) qrTitle.innerText = "Profile QR Code";
    if (qrDesc) qrDesc.innerText = "Scan to share contact";

    // Generate QR (Profile Default)
    const qrPayload = {
        type: 'profile',
        email: currentUser.email
    };
    const qrData = JSON.stringify(qrPayload);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
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
    const img = document.getElementById("myQrCode");
    if (!img || !img.src) return;

    try {
        // Convert to Blob
        const blob = await fetch(img.src).then(r => r.blob());
        const file = new File([blob], "contact_qr.png", { type: blob.type });

        // Method 1: Web Share API (Mobile + Supported Desktops)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'Socket-Sync Contact',
                text: 'Scan this QR code to add me on Socket-Sync!',
                files: [file]
            });
        }
        // Method 2: Copy to Clipboard (Fallback)
        else {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);
                alert("QR Code copied to clipboard!");
            } catch (err) {
                console.warn("Clipboard write failed", err);
                alert("Sharing not supported on this device. Please use 'Download' instead.");
            }
        }
    } catch (e) {
        console.error("Share failed", e);
        alert("Could not share QR code.");
    }
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
    if (!confirm("Are you sure you want to delete your account? This action is IRREVERSIBLE and will delete all your messages and contacts.")) {
        return;
    }

    if (!currentUser) return;

    try {
        // 1. Delete Profile (Cascades to messages, contacts, etc.)
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', currentUser.user_id);

        if (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete account: " + error.message + "\n\n(Please run the SQL command provided to enable deletion)");
        } else {
            alert("Account deleted successfully.");
            logout(); // Clear local storage and redirect
        }
    } catch (e) {
        console.error("Delete error:", e);
        alert("An unexpected error occurred during deletion.");
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
// ================= LINK DEVICE (SENDER) LOGIC =================
let linkDeviceScanner = null;

window.linkNewDevice = function () {
    const modal = document.getElementById("linkDeviceModal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex"; // Force flex
        startLinkScanner();
    }
}

window.closeLinkDeviceModal = async function () {
    const modal = document.getElementById("linkDeviceModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
    if (linkDeviceScanner) {
        try {
            // Check if running (state 2) or paused (3)
            if (linkDeviceScanner.getState && (linkDeviceScanner.getState() === 2 || linkDeviceScanner.getState() === 3)) {
                await linkDeviceScanner.stop();
            }
            await linkDeviceScanner.clear();
        } catch (e) {
            console.warn("Error stopping scanner:", e);
        }
        linkDeviceScanner = null;
    }
}

async function startLinkScanner() {
    if (linkDeviceScanner) return;

    // Use Headless Scanner for custom UI control
    linkDeviceScanner = new Html5Qrcode("link-scanner-reader");

    try {
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        // Wait for modal transition
        setTimeout(async () => {
            // Environment (Back) Camera
            await linkDeviceScanner.start(
                { facingMode: "environment" },
                config,
                onLinkScanSuccess
            );
        }, 300); // 300ms delay for modal animation

    } catch (err) {
        console.error("Camera Error", err);
        document.getElementById("link-scanner-reader").innerHTML =
            `<p style="color:var(--danger-color); padding:20px; text-align:center;">
                Camera Error: ${err.message}<br>
                Please allow camera permissions.
             </p>`;
    }
}

async function onLinkScanSuccess(decodedText) {
    console.log("Link Scan Result:", decodedText);
    try {
        const payload = JSON.parse(decodedText);
        if (payload.type === 'remote_login' && payload.id) {

            // 1. Stop Scanner
            if (linkDeviceScanner) {
                try {
                    await linkDeviceScanner.stop();
                    await linkDeviceScanner.clear();
                } catch (e) { console.warn("Stop error", e); }
                linkDeviceScanner = null;
            }

            document.getElementById("link-scanner-reader").innerHTML =
                `<div style="text-align:center; padding:20px; color:#28a745;">
                    <i class="fas fa-check-circle" style="font-size:3rem; margin-bottom:10px;"></i>
                    <h4>Sending Login...</h4>
                 </div>`;

            // 2. Get Session
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                alert("Error: You are not logged in on this device.");
                return;
            }

            // 3. Connect & Send
            console.log(`Connecting to channel: login-sync:${payload.id}`);
            const channel = supabase.channel(`login-sync:${payload.id}`);

            channel.subscribe(async (status) => {
                console.log(`Channel Status: ${status}`);

                if (status === 'SUBSCRIBED') {
                    console.log("Sending remote_login_approval...");
                    const res = await channel.send({
                        type: 'broadcast',
                        event: 'remote_login_approval',
                        payload: {
                            session: {
                                access_token: data.session.access_token,
                                refresh_token: data.session.refresh_token
                            }
                        }
                    });

                    console.log("Send Result:", res);

                    // 4. Cleanup
                    if (res === 'ok') {
                        setTimeout(() => {
                            supabase.removeChannel(channel);
                            closeLinkDeviceModal();
                            showAlert("Device Linked Successfully!", "success");
                        }, 1000);
                    } else {
                        alert("Failed to send login signal. Please try again.");
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Scan Error", e);
    }
}
