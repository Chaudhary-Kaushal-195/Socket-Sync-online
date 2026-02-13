import os
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime
import json
import time

class Database:
    def __init__(self):
        # Check if already initialized to avoid "app already exists" error
        if not firebase_admin._apps:
            # PROD: Load from Env Var
            cred_json = os.getenv("FIREBASE_CREDENTIALS")
            database_url = "https://socketsync-1f92b-default-rtdb.firebaseio.com/"
            
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred, {
                    'databaseURL': database_url
                })
            else:
                # LOCAL: Try to load from local file if env var not set
                try:
                    cred_path = "serviceAccountKey.json"
                    if os.path.exists(cred_path):
                        cred = credentials.Certificate(cred_path)
                        firebase_admin.initialize_app(cred, {
                            'databaseURL': database_url
                        })
                    else:
                        print("WARNING: No Firebase Credentials found. DB will fail.")
                except Exception as e:
                    print(f"Failed to init Firebase: {e}")
        
        try:
            self.ref = db.reference('/')
            self.users_ref = self.ref.child('users')
            self.chats_ref = self.ref.child('chats')
        except:
            self.ref = None

    def _get_pair_id(self, u1, u2):
        return "-".join(sorted([str(u1), str(u2)]))

    def get_user_by_id(self, user_id):
        try:
            user = self.users_ref.child(user_id).get()
            return user
        except Exception as e:
            print(f"Error getting user: {e}")
            return None

    def create_user(self, user_data):
        try:
            # Check if exists
            if self.get_user_by_id(user_data["userId"]):
                return False, "User already exists"
                
            self.users_ref.child(user_data["userId"]).set({
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
        try:
            self.users_ref.child(user_id).update({"password": new_hash})
        except Exception as e:
            print(f"Error updating password: {e}")

    def get_qr_token(self, user_id):
        user = self.get_user_by_id(user_id)
        return user.get("qr_token") if user else None

    def update_qr_token(self, user_id, token):
        try:
            self.users_ref.child(user_id).update({"qr_token": token})
        except:
            pass

    def get_user_by_qr_token(self, token):
        try:
            # Query in RTDB is different. Requires indexing in rules.
            # efficient enough for small DB. For large DB, index on qr_token.
            # Here we scan (not ideal for million users, fine for MVP)
            users = self.users_ref.order_by_child('qr_token').equal_to(token).limit_to_first(1).get()
            for k, v in users.items():
                return v
            return None
        except:
            return None

    def update_avatar(self, user_id, avatar_url):
        try:
            self.users_ref.child(user_id).update({"avatar": avatar_url})
            return True
        except:
            return False

    def get_all_users(self):
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
        except:
            return []

    def save_message(self, data):
        try:
            # Structure: chats/{pair_id}/messages/{msg_id}
            sender = data["sender"]
            receiver = data["receiver"]
            pair_id = self._get_pair_id(sender, receiver)
            
            # Prepare data
            # RTDB doesn't like datetime objects, use ISO string or timestamp
            data["timestamp"] = str(datetime.now()) 
            data["status"] = data.get("status", "sent")
            data["is_revoked"] = False
            
            # Push generates a unique ID based on timestamp
            new_ref = self.chats_ref.child(pair_id).child('messages').push(data)
            return new_ref.key
        except Exception as e:
            print(f"Error saving message: {e}")
            return None

    def get_message_by_id(self, msg_id):
        # RTDB doesn't support global ID lookup easily if nested.
        # This function was used for deletion.
        # We need the pair_id to find the message efficiently.
        # If we don't have it, we might struggle.
        # BUT: For deletion commands, the frontend usually sends the ID.
        # In this architecture, maybe we need to store a global mapping or search?
        # NO, 'delete_message' in server.py is passed 'msg_id'.
        # Refactoring: server.py needs to pass sender/receiver OR we search.
        # Searching all chats is bad.
        # Assumption: We might have to compromise or store a global 'message_index/{msg_id} -> {pair_id}'
        # Let's add that for robust deletion.
        pass

    # Modified for RTDB: We need pair context
    def get_message_context(self, msg_id):
        # This is hard without an index.
        # Optimization: Client should send context.
        # For now, let's implement a slow search or separate index if needed.
        # Actually, let's try to maintain a 'message_index' node.
        try:
             idx = self.ref.child('message_index').child(msg_id).get()
             if idx:
                 return self.chats_ref.child(idx['pair']).child('messages').child(msg_id).get(), idx['pair']
             return None, None
        except:
            return None, None

    def save_message_index(self, msg_id, pair_id):
        try:
            self.ref.child('message_index').child(msg_id).set({"pair": pair_id})
        except:
            pass

    # Override save_message to include index
    def save_message(self, data):
        try:
            sender = data["sender"]
            receiver = data["receiver"]
            pair_id = self._get_pair_id(sender, receiver)
            
            data["timestamp"] = datetime.now().isoformat()
            data["status"] = "sent"
            data["is_revoked"] = False
            
            new_ref = self.chats_ref.child(pair_id).child('messages').push(data)
            
            # Index for lookup
            self.ref.child('message_index').child(new_ref.key).set({"pair": pair_id})
            
            return new_ref.key
        except Exception as e:
            print(f"Error saving message: {e}")
            return None

    def get_message_by_id(self, msg_id):
        try:
            # Use index
            idx = self.ref.child('message_index').child(msg_id).get()
            if idx:
                pair_id = idx['pair']
                msg = self.chats_ref.child(pair_id).child('messages').child(msg_id).get()
                if msg:
                    msg['id'] = msg_id
                    msg['pair_id'] = pair_id # Helper
                    return msg
            return None
        except:
            return None

    def get_messages_between(self, u1, u2):
        try:
            pair_id = self._get_pair_id(u1, u2)
            # Fetch last 50 messages for speed
            msgs_dict = self.chats_ref.child(pair_id).child('messages').order_by_key().limit_to_last(100).get()
            
            if not msgs_dict: return []
            
            all_msgs = []
            for mid, m in msgs_dict.items():
                m["id"] = mid
                
                # Check deleted for me
                if m.get('sender') == u1 and m.get('deleted_by_sender'): continue
                if m.get('receiver') == u1 and m.get('deleted_by_receiver'): continue
                
                if m.get('is_revoked'):
                     m['message'] = "🚫 This message was deleted"
                     m['file_url'] = None
                     m['file_type'] = None
                
                all_msgs.append(m)
            
            return all_msgs
        except Exception as e:
            print(f"Error fetching messages: {e}")
            return []

    def delete_message(self, msg_id):
        # Revoke
        try:
            msg = self.get_message_by_id(msg_id)
            if msg:
                pair_id = msg.get('pair_id') # set in get_message_by_id
                if pair_id:
                     self.chats_ref.child(pair_id).child('messages').child(msg_id).update({
                        "message": "🚫 This message was deleted",
                        "file_url": None,
                        "file_type": None,
                        "is_revoked": True
                    })
                     return True
            return False
        except:
            return False

    def delete_message_for_user(self, msg_id, user_id):
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
        except:
            return False

    def bulk_delete_messages(self, msg_ids):
        # Inefficient in RTDB to do one by one if not batched, but batching by path is tricky.
        # Just loop for now.
        for mid in msg_ids:
            self.delete_message(mid)

    def bulk_delete_message_for_user(self, msg_ids, user_id):
        for mid in msg_ids:
            self.delete_message_for_user(mid, user_id)

    def mark_messages_read(self, sender, receiver):
        try:
            pair_id = self._get_pair_id(sender, receiver)
            # In RTDB, cannot easy "update where status != read".
            # Must fetch, filter, update.
            # This is slow if too many unread.
            # Optimization for Chat App: Store "unread_count" or "last_read_timestamp".
            # Implementing robust "mark all unread as read":
            
            # 1. Fetch unread messages sent by sender
            # Using order_by_child is possible if indexed.
            # For now, fetch last 20? 
            # Or just update the 'status' of the conversation?
            
            # Simple approach: Fetch messages, loop, update.
            # Limit to recent 50 to avoid hanging.
            msgs = self.chats_ref.child(pair_id).child('messages').order_by_child('status').equal_to('sent').get()
            
            count = 0
            if msgs:
                updates = {}
                for mid, m in msgs.items():
                    if m.get('receiver') == receiver: # security check
                        updates[f"{mid}/status"] = "read"
                        count += 1
                
                if updates:
                    self.chats_ref.child(pair_id).child('messages').update(updates)
            
            return count
        except:
            return 0

    def mark_message_delivered(self, msg_id):
        try:
            msg = self.get_message_by_id(msg_id)
            if msg:
                pair_id = msg['pair_id']
                self.chats_ref.child(pair_id).child('messages').child(msg_id).update({"status": "delivered"})
        except:
            pass

    def mark_offline_messages_delivered(self, user_id):
        # Hard in RTDB without global index.
        # Skipping "offline delivery" global check for MVP performance.
        # It requires scanning ALL chats involving user_id.
        return []

    # Contacts
    def add_contact(self, user_id, contact_id):
        try:
            if not self.get_user_by_id(contact_id):
                return False, "User not found"
            
            self.users_ref.child(user_id).child('contacts').child(contact_id).set({
                "contact_id": contact_id,
                "added_at": str(datetime.now())
            })
            return True, None
        except Exception as e:
            return False, str(e)

    def remove_contact(self, user_id, contact_id):
        try:
            self.users_ref.child(user_id).child('contacts').child(contact_id).delete()
            return True
        except:
            return False

    def get_contacts(self, user_id):
        try:
            c_dict = self.users_ref.child(user_id).child('contacts').get()
            contacts = []
            if c_dict:
                for cid in c_dict:
                    u = self.get_user_by_id(cid)
                    if u:
                        contacts.append({
                            "user_id": u["user_id"],
                            "name": u["name"],
                            "avatar": u["avatar"]
                        })
            return contacts
        except:
            return []

    def get_chat_list(self, user_id):
        return self.get_contacts(user_id)

    # Block
    def toggle_block(self, blocker, blocked):
        try:
            ref = self.users_ref.child(blocker).child('blocked').child(blocked)
            if ref.get():
                ref.delete()
                return False
            else:
                ref.set(True)
                return True
        except:
            return False

    def is_blocked(self, u1, u2):
        try:
            b1 = self.users_ref.child(u1).child('blocked').child(u2).get()
            b2 = self.users_ref.child(u2).child('blocked').child(u1).get()
            return b1 is not None or b2 is not None
        except:
            return False

    def get_block_state(self, me, other):
        try:
            if self.users_ref.child(me).child('blocked').child(other).get():
                return "blocked_by_me"
            if self.users_ref.child(other).child('blocked').child(me).get():
                return "blocked_by_other"
            return "none"
        except:
            return "none"

    def clear_chat(self, u1, u2):
        pass

    def update_login_streak(self, *args): pass
    def get_profile_stats(self, *args): return {}
    def get_user_message_counts(self): return {}
    def delete_user_data(self, *args): return False
    def get_chat_media(self, u1, u2): return []
