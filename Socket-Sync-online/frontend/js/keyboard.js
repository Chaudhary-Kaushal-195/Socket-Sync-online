// ================= KEYBOARD SHORTCUTS MANAGER =================
// Handles navigation, selection, and actions via keypress

// Message Selection State
let selAnchorIndex = -1;
let selFocusIndex = -1;
let isTabHeld = false;

// Reset tab state on blur window to prevent stuck key
window.addEventListener("blur", () => { isTabHeld = false; });
window.addEventListener("keyup", (e) => {
    if (e.key === "Tab") isTabHeld = false;
});

document.addEventListener("DOMContentLoaded", () => {

    // 1. Message Input "Enter" Listener
    if (msgInput) {
        msgInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); // Prevent newline
                send();
            }
        });
    }

    // 2. Global Key Listener
    document.addEventListener("keydown", (e) => {
        const inMsgInput = (e.target.id === 'msg');

        // --- TAB MODIFIER TRACKING ---
        if (e.key === "Tab") {
            isTabHeld = true;
            e.preventDefault(); // Prevent default browser tab navigation always
            return;
        }

        // --- 1. DYNAMIC FOCUS SCOPE & NAVIGATION ---
        // Prepare navigation helpers (focusNext/Prev) for use by Tab+Arrow or Modals
        const modal = document.querySelector(".media-modal:not(.hidden), .modal-overlay:not(.hidden), #ctxMenu:not(.hidden)");
        const context = modal || document;

        // Get all relevant focusables
        const focusables = Array.from(context.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.closest('.hidden') && !el.disabled && el.offsetParent !== null);

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const currentIndex = focusables.indexOf(document.activeElement);

        const focusNext = () => {
            e.preventDefault();
            if (focusables.length === 0) return;
            if (currentIndex === -1 || currentIndex === focusables.length - 1) first.focus();
            else focusables[currentIndex + 1].focus();
        };

        const focusPrev = () => {
            e.preventDefault();
            if (focusables.length === 0) return;
            if (currentIndex === -1 || currentIndex === 0) last.focus();
            else focusables[currentIndex - 1].focus();
        };

        // --- 2. TAB + ARROW NAVIGATION (REPLACES STANDARD TAB) ---
        if (isTabHeld) {
            if (e.key === "ArrowDown") {
                focusNext();
                return;
            }
            if (e.key === "ArrowUp") {
                focusPrev();
                return;
            }
        }

        // --- 3. MODAL ARROW NAVIGATION (Without Tab) ---
        // If inside a modal, Arrow keys alone should still navigate (standard menu behavior)
        if (modal && !isTabHeld) {
            // SPECIAL: Carousel Navigation (Left/Right)
            const carouselModal = document.getElementById("carouselModal");
            if (carouselModal && !carouselModal.classList.contains("hidden")) {
                if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    if (typeof carouselPrev === 'function') carouselPrev();
                    return;
                }
                if (e.key === "ArrowRight") {
                    e.preventDefault();
                    if (typeof carouselNext === 'function') carouselNext();
                    return;
                }
            }


            // Up/Down: Navigate between modal elements
            // Left/Right: Only for carousel (when not in input)
            const isInInputField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            if (e.key === "ArrowDown") { focusNext(); return; }
            if (e.key === "ArrowUp") { focusPrev(); return; }

            // Allow Left/Right for text cursor in inputs - don't intercept

        }

        // --- 4. ENTER KEY HANDLING (Works in modals AND globally) ---
        if (e.key === "Enter") {
            if (inMsgInput) return; // Don't interfere with message input

            // Shift+Enter = Context Menu (Right Click)
            if (e.shiftKey) {
                if (document.activeElement) {
                    e.preventDefault();
                    document.activeElement.dispatchEvent(new MouseEvent('contextmenu', {
                        'view': window,
                        'bubbles': true,
                        'cancelable': true,
                        'clientX': document.activeElement.getBoundingClientRect().left + 10,
                        'clientY': document.activeElement.getBoundingClientRect().top + 10
                    }));
                }
                return;
            }

            // Enter = Click / Action
            if (document.activeElement) {
                // Special actions for Messages (Open Preview)
                if (document.activeElement.classList.contains("msg")) {
                    const mediaClickable = document.activeElement.querySelector(".media-box, .chat-video, .file-card");
                    if (mediaClickable) {
                        e.preventDefault();
                        mediaClickable.click();
                        return;
                    }
                }

                // Standard Click for Buttons/Links (including close buttons)
                if (document.activeElement.classList.contains("dropdown-item") ||
                    document.activeElement.classList.contains("media-close") ||
                    document.activeElement.getAttribute("role") === "button" ||
                    document.activeElement.getAttribute("tabindex") === "0") {

                    if (document.activeElement.tagName !== "BUTTON" && document.activeElement.tagName !== "A") {
                        e.preventDefault();
                        document.activeElement.click();
                        return;
                    }
                    return;
                }
            }

            // Fallback for other focusable items
            if (!modal) openFocusedItem();
        }

        // --- 5. GLOBAL SHORTCUTS (When NO Modal) ---

        // Input Filters
        if (e.target.tagName === 'INPUT' && !inMsgInput) return;
        if (e.target.tagName === 'TEXTAREA') return;

        // Delete Shortcut
        if (e.key === "Delete" || e.key === "Backspace") {
            if (inMsgInput) return;
            if (e.target.tagName === 'INPUT') return;

            if (typeof selectedMessages !== 'undefined' && selectedMessages.size > 0 && typeof bulkDelete === 'function') {
                e.preventDefault();
                bulkDelete();
                return;
            }
        }

        // Message/Chat List Selection (Arrow Keys Alone)
        // This is for selecting/highlighting items (blue border), NOT focus navigation
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!isTabHeld) { // Only if Tab NOT held
                if (e.shiftKey) {
                    e.preventDefault();
                    handleMessageSelection(e.key === "ArrowUp" ? -1 : 1);
                } else {
                    if (inMsgInput) {
                        e.preventDefault();
                        navigateActiveList(e.key === "ArrowUp" ? -1 : 1);
                    } else if (!e.target.closest('input')) {
                        e.preventDefault();
                        navigateActiveList(e.key === "ArrowUp" ? -1 : 1);
                    }
                }
            }
        }

        // Enter / Shift+Enter
        if (e.key === "Enter") {
            if (inMsgInput) return;

            // Shift+Enter = Context Menu (Right Click)
            if (e.shiftKey) {
                if (document.activeElement) {
                    e.preventDefault();
                    document.activeElement.dispatchEvent(new MouseEvent('contextmenu', {
                        'view': window,
                        'bubbles': true,
                        'cancelable': true,
                        'clientX': document.activeElement.getBoundingClientRect().left + 10,
                        'clientY': document.activeElement.getBoundingClientRect().top + 10
                    }));
                }
                return;
            }

            // Enter = Click / Action
            if (document.activeElement) {
                // Special actions for Messages (Open Preview)
                if (document.activeElement.classList.contains("msg")) {
                    // Try to find clickables inside (Image, Video, File)
                    const mediaClickable = document.activeElement.querySelector(".media-box, .chat-video, .file-card");
                    if (mediaClickable) {
                        e.preventDefault();
                        mediaClickable.click();
                        return;
                    }
                }

                // Standard Click for Buttons/Links
                if (document.activeElement.classList.contains("dropdown-item") ||
                    document.activeElement.getAttribute("role") === "button" ||
                    document.activeElement.getAttribute("tabindex") === "0") {

                    if (document.activeElement.tagName !== "BUTTON" && document.activeElement.tagName !== "A") {
                        document.activeElement.click();
                        e.preventDefault();
                    }
                    return;
                }
            }
            openFocusedItem();
        }

        if (e.key === "Escape") {
            e.preventDefault();
            if (msgInput) msgInput.focus();
        }

        if (e.altKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            const search = document.querySelector("input[placeholder='Search chats...']");
            if (search) search.focus();
        }

        if (e.altKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (msgInput) msgInput.focus();
        }
    });
});

// Navigation State
function getActiveListItems() {
    const forwardModal = document.getElementById("forwardModal");
    if (forwardModal && !forwardModal.classList.contains("hidden")) {
        return Array.from(forwardModal.querySelectorAll(".chat-item"));
    }

    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("hide")) {
        return Array.from(document.querySelectorAll("#chatList .chat-item"));
    }

    return [];
}

function navigateActiveList(direction) {
    const items = getActiveListItems();
    if (items.length === 0) return;

    let currentIndex = items.findIndex(el => el.classList.contains("keyboard-focus"));

    document.querySelectorAll(".keyboard-focus").forEach(el => el.classList.remove("keyboard-focus"));

    if (currentIndex === -1) {
        currentIndex = direction > 0 ? -1 : items.length;
    }

    currentIndex += direction;

    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= items.length) currentIndex = items.length - 1;

    const target = items[currentIndex];
    if (target) {
        target.classList.add("keyboard-focus");
        target.scrollIntoView({ block: "nearest" });
        target.focus(); // Actually focus it for Tab trap to work
    }
}

function openFocusedItem() {
    const focused = document.querySelector(".keyboard-focus");
    if (focused) focused.click();
}

// Message Selection Logic
function handleMessageSelection(direction) {
    const selHeader = document.getElementById("selectionHeader");
    if (selHeader && selHeader.classList.contains("hidden")) {
        // Auto-enter selection mode if shift is held (which it is for this call usually)
        if (typeof toggleSelectionMode === 'function') toggleSelectionMode();
        selAnchorIndex = -1;
        selFocusIndex = -1;
    }

    if (typeof selectedMessages !== 'undefined' && selectedMessages.size === 0) {
        selAnchorIndex = -1;
        selFocusIndex = -1;
    }

    // OPTIMIZATION: Use children of container instead of querySelectorAll(".msg") if possible
    // or scoped query. 
    const messagesContainer = document.getElementById("messages");
    if (!messagesContainer) return;

    // Convert HTMLCollection to Array (faster than querySelectorAll all over document)
    // Filter only element nodes that are messages (just to be safe)
    const allMsgs = Array.from(messagesContainer.children).filter(el => el.classList.contains("msg"));

    if (allMsgs.length === 0) return;

    // Get IDs from dataset
    const msgIds = allMsgs.map(el => parseInt(el.dataset.id));

    // CHECK FOR MANUAL SELECTION SYNC
    if (typeof selectedMessages !== 'undefined' && selectedMessages.size === 1) {
        const singleId = Array.from(selectedMessages)[0];
        const currentFocusId = (selFocusIndex !== -1 && selFocusIndex < msgIds.length) ? msgIds[selFocusIndex] : -1;

        if (singleId !== currentFocusId) {
            const idx = msgIds.indexOf(singleId);
            if (idx !== -1) {
                selAnchorIndex = idx;
                selFocusIndex = idx;
            }
        }
    }

    // Initialize Anchor/Focus if needed
    if (selAnchorIndex === -1 || selFocusIndex === -1) {
        if (typeof selectedMessages !== 'undefined' && selectedMessages.size > 0) {
            // Fallback for multi-select manual init?
            const selectedArr = Array.from(selectedMessages);
            const lastId = selectedArr[selectedArr.length - 1];
            const idx = msgIds.indexOf(lastId);
            selAnchorIndex = idx !== -1 ? idx : allMsgs.length - 1;
            selFocusIndex = selAnchorIndex;
        } else {
            // Virtual Start for Default Bottom Selection
            // Start cursor "below" list.
            selAnchorIndex = allMsgs.length - 1; // Anchor is the Last Msg
            selFocusIndex = allMsgs.length;      // Focus is Below Last Msg
        }
    }

    // Move Focus
    let newFocusIndex = selFocusIndex + (direction === -1 ? -1 : 1);

    // Clamp
    if (newFocusIndex < 0) newFocusIndex = 0;
    if (newFocusIndex >= msgIds.length) newFocusIndex = msgIds.length - 1;

    if (newFocusIndex === selFocusIndex) return; // No movement

    // SPECIAL HANDLING: Transition from Virtual Start
    // If we were at "Virtual Bottom" and move to "Real Bottom", just select it.
    if (selFocusIndex === msgIds.length) {
        if (newFocusIndex === msgIds.length - 1) {
            const id = msgIds[newFocusIndex];
            if (typeof toggleMessageSelect === 'function') toggleMessageSelect(id);
            selFocusIndex = newFocusIndex;

            // Scroll to Focus
            const targetId = msgIds[selFocusIndex];
            if (targetId) {
                const el = document.getElementById(`msg-${targetId}`);
                if (el) {
                    el.scrollIntoView({ block: "nearest" });
                    el.focus();
                }
            }
            return;
        }
    }

    // --- RANGE LOGIC ---
    // Compare Old Range vs New Range
    const oldMin = Math.min(selAnchorIndex, selFocusIndex);
    const oldMax = Math.max(selAnchorIndex, selFocusIndex);

    const newMin = Math.min(selAnchorIndex, newFocusIndex);
    const newMax = Math.max(selAnchorIndex, newFocusIndex);

    // 1. Deselect items that fell out of range
    for (let i = oldMin; i <= oldMax; i++) {
        if (i < newMin || i > newMax) {
            // Guard against Virtual Focus Index which is out of bounds
            if (i >= msgIds.length) continue;

            const id = msgIds[i];
            if (typeof selectedMessages !== 'undefined' && selectedMessages.has(id)) {
                if (typeof toggleMessageSelect === 'function') toggleMessageSelect(id);
            }
        }
    }

    // 2. Select items that entered range
    for (let i = newMin; i <= newMax; i++) {
        if (i < oldMin || i > oldMax) {
            if (i >= msgIds.length) continue; // Boundary guard

            const id = msgIds[i];
            if (typeof selectedMessages !== 'undefined' && !selectedMessages.has(id)) {
                if (typeof toggleMessageSelect === 'function') toggleMessageSelect(id);
            }
        }
    }

    // Update State
    selFocusIndex = newFocusIndex;

    // Scroll and Focus
    const targetId = msgIds[selFocusIndex];
    if (targetId) {
        const el = document.getElementById(`msg-${targetId}`);
        if (el) {
            el.scrollIntoView({ block: "nearest" });
            el.focus(); // Key for tab trap
        }
    }
}
