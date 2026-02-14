// ================= SUPABASE =================
// Supabase is initialized in js/modules/supabase-client.js
// and available as 'window.supabase'

// Legacy Socket.IO removed.
const socket = null; // Placeholder to prevent crash in un-migrated files for now
const API_BASE = ""; // Not needed for Supabase (direct connection)

// ================= GLOBALS =================
var currentUser = null;
var currentChat = null;
const messageCache = new Map(); // <userId, Array<Message>>
const onlineUsers = new Set(); // <userId>
let msgQueue = JSON.parse(localStorage.getItem("msgQueue") || "[]");
let selectedFiles = [];

// Expose to window to ensure access across scripts
window.currentUser = currentUser;
window.currentChat = currentChat;
window.messageCache = messageCache;
window.onlineUsers = onlineUsers;

// ================= DOM ELEMENTS (COMMON) =================
const chatHeaderTitle = document.getElementById("chatHeaderTitle");
const chatAvatarImg = document.getElementById("chatAvatar");
const messagesBox = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const fileInputEl = document.getElementById("fileInput");
const chatList = document.getElementById("chatList");
