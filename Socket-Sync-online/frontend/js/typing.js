// ================= TYPING INDICATOR =================
let typingTimeout;

msgInput.addEventListener('input', () => {
    if (!currentChat) return;

    // Emit typing started
    socket.emit("typing", {
        to: currentChat,
        from: currentUser.user_id,
        typing: true
    });

    // Clear previous timeout
    clearTimeout(typingTimeout);

    // Auto-stop typing after 2 seconds of inactivity
    typingTimeout = setTimeout(() => {
        socket.emit("typing", {
            to: currentChat,
            from: currentUser.user_id,
            typing: false
        });
    }, 2000);
});

// Also stop typing when message is sent (handled in sendMessage implicitly)

// Listen for typing events
socket.on("user_typing", (data) => {
    if (data.from === currentChat) {
        const typingIndicator = document.getElementById("typingIndicator");
        const typingUserName = document.getElementById("typingUserName");

        if (data.typing) {
            // Get the name from chat header or use "User"
            const userName = chatHeaderTitle.innerText || "User";
            typingUserName.innerText = userName;
            typingIndicator.classList.remove("hidden");
        } else {
            typingIndicator.classList.add("hidden");
        }
    }
});
