// ================= SOCKET =================
// Determine API_BASE based on environment
let API_BASE;
const hostname = window.location.hostname;

if (hostname === "127.0.0.1" || hostname === "localhost") {
    // Local Development (works for both Live Server :5500 and Flask :5000)
    API_BASE = "http://127.0.0.1:5000";
    console.log("Environment: Local Development");
} else {
    // Production (Vercel Frontend -> Render Backend)
    API_BASE = "https://socket-sync-backend.onrender.com";
    console.log("Environment: Production (Vercel -> Render)");
}

// Socket Connection with Robust Options
const socket = io(API_BASE, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000 // 20s timeout as requested
});

// ================= GLOBALS =================
let currentUser = null;
let currentChat = null;
const messageCache = new Map(); // <userId, Array<Message>>
let msgQueue = JSON.parse(localStorage.getItem("msgQueue") || "[]");
let selectedFiles = [];

// ================= DOM ELEMENTS (COMMON) =================
const chatHeaderTitle = document.getElementById("chatHeaderTitle");
const chatAvatarImg = document.getElementById("chatAvatar");
const messagesBox = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const fileInputEl = document.getElementById("fileInput");
const chatList = document.getElementById("chatList");



