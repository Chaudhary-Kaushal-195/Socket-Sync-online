// ================= SOCKET =================
const API_BASE = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:5000"
    : "https://socket-sync-backend.onrender.com"; // TODO: Replace with your actual Render Backend URL
const socket = io(API_BASE);

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



