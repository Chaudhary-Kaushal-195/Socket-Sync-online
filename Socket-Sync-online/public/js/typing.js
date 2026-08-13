// ================= TYPING INDICATOR =================
let typingTimeout;

msgInput.addEventListener('input', () => {
    if (!currentChat) return;

    // Emit typing started
    if (typeof sendTypingEvent === 'function') {
        sendTypingEvent(true, currentChat);
    }

    // Clear previous timeout
    clearTimeout(typingTimeout);

    // Auto-stop typing after 2 seconds of inactivity
    typingTimeout = setTimeout(() => {
        if (typeof sendTypingEvent === 'function') {
            sendTypingEvent(false, currentChat);
        }
    }, 2000);
});

// Listener is now in socket-client.js setupSupabaseRealtime

