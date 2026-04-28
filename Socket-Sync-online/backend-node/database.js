import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log("Supabase initialized successfully.");
} else {
  console.log("No Supabase credentials found in .env! Running in Local Memory fallback mode.");
}

// In-Memory Fallback Database
const memDB = {
  users: {},
  messages: []
};

const getPairId = (u1, u2) => [u1, u2].sort().join('-');

export class Database {
  async getUserById(userId) {
    if (supabase) {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      return data;
    }
    return memDB.users[userId] || null;
  }

  async createUser(userData) {
    if (supabase) {
      // Supabase logic (requires Auth setup)
      const { data, error } = await supabase.auth.signUp({
        email: userData.userId,
        password: userData.password,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    
    // In-memory fallback
    if (memDB.users[userData.userId]) {
      return { success: false, error: "User already exists" };
    }
    memDB.users[userData.userId] = {
      user_id: userData.userId,
      name: userData.name,
      password: userData.password, // hashed by server.js
      avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`,
      login_streak: 0,
      last_login: null
    };
    return { success: true };
  }

  async updateLoginStreak(userId) {
    if (supabase) return; // Simplified for Supabase
    const user = memDB.users[userId];
    if (user) {
      user.last_login = new Date().toISOString();
      user.login_streak += 1;
    }
  }

  async saveMessage(data) {
    if (supabase) {
      // Insert to Supabase
      return "supa-id-" + Date.now();
    }
    const msg = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
      sender: data.sender,
      receiver: data.receiver,
      message: data.message,
      file_url: data.file_url,
      file_type: data.file_type,
      timestamp: new Date().toISOString(),
      status: "sent",
      is_revoked: false
    };
    memDB.messages.push(msg);
    return msg.id;
  }

  async getMessagesBetween(u1, u2) {
    if (supabase) {
      // Supabase select logic
      return [];
    }
    return memDB.messages.filter(m => 
      (m.sender === u1 && m.receiver === u2) || 
      (m.sender === u2 && m.receiver === u1)
    );
  }
}

export const dbInstance = new Database();
