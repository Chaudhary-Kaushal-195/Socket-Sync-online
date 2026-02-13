// ================= SOCKET =================
// ================= SOCKET =================
// Unified: Backend serves Frontend, so API Base is just the origin
// However, if we run strict separate dev (live server), we might need localhost:5000 explicitly
const API_BASE = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port !== "5000"
    ? "http://127.0.0.1:5000" // If running via Live Server
    : window.location.origin; // If served by Flask (Production OR Local Flask)

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



