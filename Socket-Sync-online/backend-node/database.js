import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

let db;
let usersRef;
let chatsRef;

// Initialize Firebase
try {
  let cred;
  if (process.env.FIREBASE_CREDENTIALS) {
    cred = admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS));
  } else if (fs.existsSync('../serviceAccountKey.json')) {
    const rawdata = fs.readFileSync('../serviceAccountKey.json', 'utf8');
    cred = admin.credential.cert(JSON.parse(rawdata));
  } else if (fs.existsSync('./serviceAccountKey.json')) {
    const rawdata = fs.readFileSync('./serviceAccountKey.json', 'utf8');
    cred = admin.credential.cert(JSON.parse(rawdata));
  }

  if (cred) {
    admin.initializeApp({
      credential: cred,
      databaseURL: "https://socketsync-1f92b-default-rtdb.firebaseio.com/"
    });
    db = admin.database();
    usersRef = db.ref('users');
    chatsRef = db.ref('chats');
    console.log("Firebase initialized successfully in Node.js");
  } else {
    console.warn("No Firebase credentials found. DB will fail.");
  }
} catch (e) {
  console.error("Firebase initialization error:", e);
}

const sanitize = (key) => String(key).replace(/\./g, ',');
const getPairId = (u1, u2) => [sanitize(u1), sanitize(u2)].sort().join('-');

export class Database {
  async getUserById(userId) {
    if (!usersRef) return null;
    const snap = await usersRef.child(sanitize(userId)).once('value');
    return snap.val();
  }

  async createUser(userData) {
    if (!usersRef) return { success: false, error: "Backend Deprecated" };
    try {
      const existing = await this.getUserById(userData.userId);
      if (existing) return { success: false, error: "User already exists" };

      await usersRef.child(sanitize(userData.userId)).set({
        user_id: userData.userId,
        name: userData.name,
        password: userData.password,
        avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`,
        created_at: new Date().toISOString(),
        login_streak: 0,
        last_login: null,
        qr_token: null
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async updateLoginStreak(userId) {
    if (!usersRef) return;
    try {
      const user = await this.getUserById(userId);
      if (!user) return;

      const now = new Date();
      let newStreak = user.login_streak || 0;

      if (user.last_login) {
        const lastDate = new Date(user.last_login);
        const diffTime = Math.abs(now - lastDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) newStreak += 1;
        else if (diffDays > 1) newStreak = 1;
      } else {
        newStreak = 1;
      }

      await usersRef.child(sanitize(userId)).update({
        last_login: now.toISOString(),
        login_streak: newStreak
      });
    } catch (e) {}
  }

  async saveMessage(data) {
    if (!chatsRef) return null;
    try {
      const pairId = getPairId(data.sender, data.receiver);
      data.timestamp = new Date().toISOString();
      data.status = "sent";
      data.is_revoked = false;

      const newRef = chatsRef.child(pairId).child('messages').push();
      await newRef.set(data);
      await db.ref('message_index').child(newRef.key).set({ pair: pairId });
      return newRef.key;
    } catch (e) {
      return null;
    }
  }

  async getMessagesBetween(u1, u2) {
    if (!chatsRef) return [];
    try {
      const pairId = getPairId(u1, u2);
      const snap = await chatsRef.child(pairId).child('messages').limitToLast(100).once('value');
      const msgsDict = snap.val();
      if (!msgsDict) return [];

      const allMsgs = [];
      for (const [mid, m] of Object.entries(msgsDict)) {
        m.id = mid;
        if (m.sender === u1 && m.deleted_by_sender) continue;
        if (m.receiver === u1 && m.deleted_by_receiver) continue;
        if (m.is_revoked) {
          m.message = "🚫 This message was deleted";
          m.file_url = null;
          m.file_type = null;
        }
        allMsgs.push(m);
      }
      return allMsgs;
    } catch (e) {
      return [];
    }
  }
}

export const dbInstance = new Database();
