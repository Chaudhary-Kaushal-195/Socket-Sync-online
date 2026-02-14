import os
from datetime import datetime
import json
import time

# Try to import firebase_admin, but handle failure for migration
try:
    import firebase_admin
    from firebase_admin import credentials, db
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("WARNING: firebase-admin not installed. Backend is in DEPRECATED mode.")

class Database:
    def __init__(self):
        self.ref = None
        self.users_ref = None
        self.chats_ref = None
        
        if not FIREBASE_AVAILABLE:
            print("Database initialized in dummy mode (Supabase Migration).")
            return

        # Check if already initialized to avoid "app already exists" error
        if not firebase_admin._apps:
            # PROD: Load from Env Var
            cred_json = os.getenv("FIREBASE_CREDENTIALS")
            database_url = "https://socketsync-1f92b-default-rtdb.firebaseio.com/"
            
            if cred_json:
                try:
                    print(f"DEBUG: Found FIREBASE_CREDENTIALS (len={len(cred_json)})")
                    cred_dict = json.loads(cred_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred, {
                        'databaseURL': database_url
                    })
                    print("DEBUG: Firebase Initialized Successfully via Env Var")
                except Exception as e:
                    print(f"CRITICAL: Failed to init Firebase from Env Var: {e}")
            else:
                # LOCAL: Try to load from local file if env var not set
                try:
                    cred_path = "serviceAccountKey.json"
                    print(f"DEBUG: Looking for local credentials at {cred_path}")
                    if os.path.exists(cred_path):
                        cred = credentials.Certificate(cred_path)
                        firebase_admin.initialize_app(cred, {
                            'databaseURL': database_url
                        })
                        print("DEBUG: Firebase Initialized Successfully via Local File")
                    else:
                        print("WARNING: No Firebase Credentials found (Env or Local). DB will fail.")
                except Exception as e:
                    print(f"Failed to init Firebase locally: {e}")
        
        try:
            self.ref = db.reference('/')
            self.users_ref = self.ref.child('users')
            self.chats_ref = self.ref.child('chats')
        except:
            self.ref = None

    def _sanitize(self, key):
        return str(key).replace('.', ',')

    def _get_pair_id(self, u1, u2):
        s1 = self._sanitize(u1)
        s2 = self._sanitize(u2)
        return "-".join(sorted([s1, s2]))

    def get_user_by_id(self, user_id):
        if not self.users_ref: return None
        try:
            user = self.users_ref.child(self._sanitize(user_id)).get()
            return user
        except Exception as e:
            return None

    def create_user(self, user_data):
        if not self.users_ref: return False, "Backend Deprecated"
        try:
            if self.get_user_by_id(user_data["userId"]):
                return False, "User already exists"
                
            self.users_ref.child(self._sanitize(user_data["userId"])).set({
                "user_id": user_data["userId"],
                "name": user_data["name"],
                "password": user_data["password"],
                "avatar": user_data["avatar"],
                "created_at": str(datetime.now()),
                "login_streak": 0,
                "last_login": None,
                "qr_token": None
            })
            return True, None
        except Exception as e:
            return False, str(e)

    def update_password(self, user_id, new_hash):
        if self.users_ref:
            try:
                self.users_ref.child(self._sanitize(user_id)).update({"password": new_hash})
            except: pass

    def get_qr_token(self, user_id):
        user = self.get_user_by_id(user_id)
        return user.get("qr_token") if user else None

    def update_qr_token(self, user_id, token):
        if self.users_ref:
            try:
                self.users_ref.child(self._sanitize(user_id)).update({"qr_token": token})
            except: pass

    def get_user_by_qr_token(self, token):
        if not self.users_ref: return None
        try:
            users = self.users_ref.order_by_child('qr_token').equal_to(token).limit_to_first(1).get()
            for k, v in users.items(): return v
            return None
        except: return None

    def update_avatar(self, user_id, avatar_url):
        if not self.users_ref: return False
        try:
            self.users_ref.child(self._sanitize(user_id)).update({"avatar": avatar_url})
            return True
        except: return False

    def get_all_users(self):
        if not self.users_ref: return []
        try:
            users_dict = self.users_ref.get()
            if not users_dict: return []
            
            users = []
            for uid, data in users_dict.items():
                users.append({
                    "user_id": data.get("user_id"),
                    "name": data.get("name"),
                    "avatar": data.get("avatar")
                })
            return users
        except: return []

    def save_message(self, data):
        if not self.chats_ref: return None
        try:
            sender = data["sender"]
            receiver = data["receiver"]
            pair_id = self._get_pair_id(sender, receiver)
            
            data["timestamp"] = datetime.now().isoformat()
            data["status"] = "sent"
            data["is_revoked"] = False
            
            new_ref = self.chats_ref.child(pair_id).child('messages').push(data)
            self.ref.child('message_index').child(new_ref.key).set({"pair": pair_id})
            return new_ref.key
        except Exception as e: return None

    def get_message_by_id(self, msg_id):
        if not self.ref: return None
        try:
            idx = self.ref.child('message_index').child(msg_id).get()
            if idx:
                pair_id = idx['pair']
                msg = self.chats_ref.child(pair_id).child('messages').child(msg_id).get()
                if msg:
                    msg['id'] = msg_id
                    msg['pair_id'] = pair_id 
                    return msg
            return None
        except: return None

    def get_messages_between(self, u1, u2):
        if not self.chats_ref: return []
        try:
            pair_id = self._get_pair_id(u1, u2)
            msgs_dict = self.chats_ref.child(pair_id).child('messages').order_by_key().limit_to_last(100).get()
            
            if not msgs_dict: return []
            
            all_msgs = []
            for mid, m in msgs_dict.items():
                m["id"] = mid
                if m.get('sender') == u1 and m.get('deleted_by_sender'): continue
                if m.get('receiver') == u1 and m.get('deleted_by_receiver'): continue
                
                if m.get('is_revoked'):
                     m['message'] = "🚫 This message was deleted"
                     m['file_url'] = None
                     m['file_type'] = None
                
                all_msgs.append(m)
            return all_msgs
        except: return []

    def delete_message(self, msg_id):
        if not self.chats_ref: return False
        try:
            msg = self.get_message_by_id(msg_id)
            if msg:
                pair_id = msg.get('pair_id')
                if pair_id:
                     self.chats_ref.child(pair_id).child('messages').child(msg_id).update({
                        "message": "🚫 This message was deleted",
                        "file_url": None,
                        "file_type": None,
                        "is_revoked": True
                    })
                     return True
            return False
        except: return False

    def delete_message_for_user(self, msg_id, user_id):
        if not self.chats_ref: return False
        try:
            msg = self.get_message_by_id(msg_id)
            if not msg: return False
            pair_id = msg.get('pair_id')
            
            updates = {}
            if msg['sender'] == user_id:
                updates['deleted_by_sender'] = True
            elif msg['receiver'] == user_id:
                 updates['deleted_by_receiver'] = True
                 
            if updates:
                self.chats_ref.child(pair_id).child('messages').child(msg_id).update(updates)
                return True
            return False
        except: return False

    def bulk_delete_messages(self, msg_ids):
        for mid in msg_ids: self.delete_message(mid)

    def bulk_delete_message_for_user(self, msg_ids, user_id):
        for mid in msg_ids: self.delete_message_for_user(mid, user_id)

    def mark_messages_read(self, sender, receiver):
        if not self.chats_ref: return 0
        try:
            pair_id = self._get_pair_id(sender, receiver)
            msgs = self.chats_ref.child(pair_id).child('messages').order_by_child('status').equal_to('sent').get()
            
            count = 0
            if msgs:
                updates = {}
                for mid, m in msgs.items():
                    if m.get('receiver') == receiver: 
                        updates[f"{mid}/status"] = "read"
                        count += 1
                
                if updates:
                    self.chats_ref.child(pair_id).child('messages').update(updates)
            return count
        except: return 0

    def mark_message_delivered(self, msg_id):
        if not self.chats_ref: return
        try:
            msg = self.get_message_by_id(msg_id)
            if msg:
                pair_id = msg['pair_id']
                self.chats_ref.child(pair_id).child('messages').child(msg_id).update({"status": "delivered"})
        except: pass

    def mark_offline_messages_delivered(self, user_id):
        return []

    # Contacts
    def add_contact(self, user_id, contact_id):
        if not self.users_ref: return False, "Backend Deprecated"
        try:
            if not self.get_user_by_id(contact_id):
                return False, "User not found"
            
            self.users_ref.child(self._sanitize(user_id)).child('contacts').child(self._sanitize(contact_id)).set({
                "contact_id": contact_id,
                "added_at": str(datetime.now())
            })
            return True, None
        except Exception as e: return False, str(e)

    def remove_contact(self, user_id, contact_id):
        if self.users_ref:
            try:
                self.users_ref.child(self._sanitize(user_id)).child('contacts').child(self._sanitize(contact_id)).delete()
                return True
            except: return False
        return False

    def get_contacts(self, user_id):
        if not self.users_ref: return []
        try:
            c_dict = self.users_ref.child(self._sanitize(user_id)).child('contacts').get()
            contacts = []
            if c_dict:
                for cid in c_dict:
                    original_contact_id = c_dict[cid].get('contact_id')
                    if original_contact_id:
                        u = self.get_user_by_id(original_contact_id)
                        if u:
                            contacts.append({
                                "user_id": u["user_id"],
                                "name": u["name"],
                                "avatar": u["avatar"]
                            })
            return contacts
        except: return []

    def get_chat_list(self, user_id):
        return self.get_contacts(user_id)

    # Block
    def toggle_block(self, blocker, blocked):
        if not self.users_ref: return False
        try:
            ref = self.users_ref.child(self._sanitize(blocker)).child('blocked').child(self._sanitize(blocked))
            if ref.get():
                ref.delete()
                return False
            else:
                ref.set(True)
                return True
        except: return False

    def is_blocked(self, u1, u2):
        if not self.users_ref: return False
        try:
            b1 = self.users_ref.child(self._sanitize(u1)).child('blocked').child(self._sanitize(u2)).get()
            b2 = self.users_ref.child(self._sanitize(u2)).child('blocked').child(self._sanitize(u1)).get()
            return b1 is not None or b2 is not None
        except: return False

    def get_block_state(self, me, other):
        if not self.users_ref: return "none"
        try:
            if self.users_ref.child(self._sanitize(me)).child('blocked').child(self._sanitize(other)).get():
                return "blocked_by_me"
            if self.users_ref.child(self._sanitize(other)).child('blocked').child(self._sanitize(me)).get():
                return "blocked_by_other"
            return "none"
        except: return "none"

    def clear_chat(self, u1, u2):
        if not self.chats_ref: return False
        try:
            pair_id = self._get_pair_id(u1, u2)
            self.chats_ref.child(pair_id).delete()
            return True
        except: return False

    def update_login_streak(self, user_id):
        if not self.users_ref: return
        try:
            u = self.get_user_by_id(user_id)
            if not u: return
            
            last_login_str = u.get("last_login")
            current_streak = u.get("login_streak", 0)
            
            now = datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            
            new_streak = current_streak
            
            if last_login_str:
                last_date = datetime.strptime(last_login_str, "%Y-%m-%d %H:%M:%S.%f").date()
                today_date = now.date()
                
                delta = (today_date - last_date).days
                if delta == 1: new_streak += 1
                elif delta > 1: new_streak = 1
            else: new_streak = 1
                
            self.users_ref.child(self._sanitize(user_id)).update({
                "last_login": str(now),
                "login_streak": new_streak
            })
        except: pass

    def get_profile_stats(self, user_id):
        if not self.users_ref: return {}
        try:
            u = self.get_user_by_id(user_id)
            if not u: return {}
            contacts = self.get_contacts(user_id)
            return {
                "streak": u.get("login_streak", 0),
                "contacts": len(contacts),
                "joined": u.get("created_at", "Unknown").split(" ")[0]
            }
        except: return {}

    def get_user_message_counts(self):
        return {}

    def delete_user_data(self, user_id):
        if self.users_ref:
            try:
                self.users_ref.child(self._sanitize(user_id)).delete()
                return True
            except: pass
        return False

    def get_chat_media(self, u1, partner_id):
        return []
