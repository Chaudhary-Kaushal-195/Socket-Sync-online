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

    def _sanitize(self, key):
        return str(key).replace('.', ',')

    def _get_pair_id(self, u1, u2):
        # Sanitize before creating pair ID to ensure no dots in path
        s1 = self._sanitize(u1)
        s2 = self._sanitize(u2)
        return "-".join(sorted([s1, s2]))

    def get_user_by_id(self, user_id):
        try:
            user = self.users_ref.child(self._sanitize(user_id)).get()
            return user
        except Exception as e:
            print(f"Error getting user: {e}")
            return None

    def create_user(self, user_data):
        try:
            # Check if exists (using sanitized ID for lookup)
            # user_data["userId"] is the original email (with dot)
            if self.get_user_by_id(user_data["userId"]):
                return False, "User already exists"
                
            # Use sanitized ID for the KEY, but store original ID in the DATA
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
        try:
            self.users_ref.child(self._sanitize(user_id)).update({"password": new_hash})
        except Exception as e:
            print(f"Error updating password: {e}")

    def get_qr_token(self, user_id):
        user = self.get_user_by_id(user_id)
        return user.get("qr_token") if user else None

    def update_qr_token(self, user_id, token):
        try:
            self.users_ref.child(self._sanitize(user_id)).update({"qr_token": token})
        except:
            pass

    def get_user_by_qr_token(self, token):
        try:
            users = self.users_ref.order_by_child('qr_token').equal_to(token).limit_to_first(1).get()
            for k, v in users.items():
                return v
            return None
        except:
            return None

    def update_avatar(self, user_id, avatar_url):
        try:
            self.users_ref.child(self._sanitize(user_id)).update({"avatar": avatar_url})
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
            sender = data["sender"]
            receiver = data["receiver"]
            pair_id = self._get_pair_id(sender, receiver) # Handles sanitization
            
            data["timestamp"] = datetime.now().isoformat()
            data["status"] = "sent"
            data["is_revoked"] = False
            
            new_ref = self.chats_ref.child(pair_id).child('messages').push(data)
            
            self.ref.child('message_index').child(new_ref.key).set({"pair": pair_id})
            
            return new_ref.key
        except Exception as e:
            print(f"Error saving message: {e}")
            return None

    def get_message_by_id(self, msg_id):
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
        except:
            return None

    def get_message_context(self, msg_id):
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

    def get_messages_between(self, u1, u2):
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
        except Exception as e:
            print(f"Error fetching messages: {e}")
            return []

    def delete_message(self, msg_id):
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
        for mid in msg_ids:
            self.delete_message(mid)

    def bulk_delete_message_for_user(self, msg_ids, user_id):
        for mid in msg_ids:
            self.delete_message_for_user(mid, user_id)

    def mark_messages_read(self, sender, receiver):
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
        return []

    # Contacts
    def add_contact(self, user_id, contact_id):
        try:
            if not self.get_user_by_id(contact_id):
                return False, "User not found"
            
            self.users_ref.child(self._sanitize(user_id)).child('contacts').child(self._sanitize(contact_id)).set({
                "contact_id": contact_id,
                "added_at": str(datetime.now())
            })
            return True, None
        except Exception as e:
            return False, str(e)

    def remove_contact(self, user_id, contact_id):
        try:
            self.users_ref.child(self._sanitize(user_id)).child('contacts').child(self._sanitize(contact_id)).delete()
            return True
        except:
            return False

    def get_contacts(self, user_id):
        try:
            c_dict = self.users_ref.child(self._sanitize(user_id)).child('contacts').get()
            contacts = []
            if c_dict:
                for cid in c_dict:
                    # cid here is the sanitized key
                    # But we stored "contact_id" (original) in the value object.
                    # Or we just use cid to fetch the user.
                    # WAIT: c_dict keys are sanitized.
                    # The VALUE has { "contact_id": "original@email.com" ... }
                    # So we should use the value's contact_id to fetch the user.
                    # Let's check what we stored in add_contact:
                    # set({"contact_id": contact_id ...}) where contact_id is original.
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
        except:
            return []

    def get_chat_list(self, user_id):
        return self.get_contacts(user_id)

    # Block
    def toggle_block(self, blocker, blocked):
        try:
            ref = self.users_ref.child(self._sanitize(blocker)).child('blocked').child(self._sanitize(blocked))
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
            b1 = self.users_ref.child(self._sanitize(u1)).child('blocked').child(self._sanitize(u2)).get()
            b2 = self.users_ref.child(self._sanitize(u2)).child('blocked').child(self._sanitize(u1)).get()
            return b1 is not None or b2 is not None
        except:
            return False

    def get_block_state(self, me, other):
        try:
            if self.users_ref.child(self._sanitize(me)).child('blocked').child(self._sanitize(other)).get():
                return "blocked_by_me"
            if self.users_ref.child(self._sanitize(other)).child('blocked').child(self._sanitize(me)).get():
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
