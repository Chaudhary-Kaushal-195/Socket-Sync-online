import os
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from datetime import datetime
import json

class Database:
    def __init__(self):
        # Check if already initialized to avoid "app already exists" error
        if not firebase_admin._apps:
            # PROD: Load from Env Var
            cred_json = os.getenv("FIREBASE_CREDENTIALS")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
            else:
                # LOCAL: Try to load from local file if env var not set
                try:
                    # Look for any json file that looks like a cred file
                    # Ideally user should have named it 'serviceAccountKey.json'
                    cred_path = "serviceAccountKey.json"
                    if os.path.exists(cred_path):
                        cred = credentials.Certificate(cred_path)
                        firebase_admin.initialize_app(cred)
                    else:
                        print("WARNING: No Firebase Credentials found (Env or File). DB will fail.")
                except Exception as e:
                    print(f"Failed to init Firebase: {e}")
        
        try:
            self.db = firestore.client()
        except:
            self.db = None

    def get_user_by_id(self, user_id):
        try:
            doc = self.db.collection('users').document(user_id).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            print(f"Error getting user: {e}")
            return None

    def create_user(self, user_data):
        try:
            # Check if exists
            if self.get_user_by_id(user_data["userId"]):
                return False, "User already exists"
                
            self.db.collection('users').document(user_data["userId"]).set({
                "user_id": user_data["userId"],
                "name": user_data["name"],
                "password": user_data["password"],
                "avatar": user_data["avatar"],
                "created_at": datetime.now(),
                "login_streak": 0,
                "last_login": None,
                "qr_token": None
            })
            return True, None
        except Exception as e:
            return False, str(e)

    def update_password(self, user_id, new_hash):
        try:
            self.db.collection('users').document(user_id).update({"password": new_hash})
        except Exception as e:
            print(f"Error updating password: {e}")

    def get_qr_token(self, user_id):
        user = self.get_user_by_id(user_id)
        return user.get("qr_token") if user else None

    def update_qr_token(self, user_id, token):
        try:
            self.db.collection('users').document(user_id).update({"qr_token": token})
        except:
            pass

    def get_user_by_qr_token(self, token):
        try:
            docs = self.db.collection('users').where(filter=FieldFilter("qr_token", "==", token)).limit(1).get()
            for doc in docs:
                return doc.to_dict()
            return None
        except:
            return None

    def update_avatar(self, user_id, avatar_url):
        try:
            self.db.collection('users').document(user_id).update({"avatar": avatar_url})
            return True
        except:
            return False

    def get_all_users(self):
        try:
            docs = self.db.collection('users').stream()
            users = []
            for doc in docs:
                data = doc.to_dict()
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
            # Add timestamps and default flags
            data["timestamp"] = datetime.now() # Firestore timestamp
            data["status"] = data.get("status", "sent")
            data["is_revoked"] = False
            data["deleted_by_sender"] = False
            data["deleted_by_receiver"] = False
            
            # Add to 'messages' collection
            update_time, ref = self.db.collection('messages').add(data)
            
            # Return the generated ID (string)
            return ref.id
        except Exception as e:
            print(f"Error saving message: {e}")
            return None

    def get_message_by_id(self, msg_id):
        try:
            doc = self.db.collection('messages').document(msg_id).get()
            if doc.exists:
                data = doc.to_dict()
                data["id"] = doc.id
                return data
            return None
        except:
            return None

    def get_messages_between(self, u1, u2):
        try:
            # Firestore requires composite index for complex queries.
            # Simplified approach: Query for (sender==u1, receiver==u2) AND (sender==u2, receiver==u1)
            # Then merge and sort in memory (efficient enough for chat apps < 10k msgs)
            
            # Query 1: u1 -> u2
            docs1 = self.db.collection('messages') \
                .where(filter=FieldFilter("sender", "==", u1)) \
                .where(filter=FieldFilter("receiver", "==", u2)) \
                .stream()
                
            # Query 2: u2 -> u1
            docs2 = self.db.collection('messages') \
                .where(filter=FieldFilter("sender", "==", u2)) \
                .where(filter=FieldFilter("receiver", "==", u1)) \
                .stream()
            
            all_msgs = []
            
            for d in list(docs1) + list(docs2):
                m = d.to_dict()
                m["id"] = d.id
                
                # Manual filtering for deleted messages
                if m.get('sender') == u1 and m.get('deleted_by_sender'):
                    continue
                if m.get('receiver') == u1 and m.get('deleted_by_receiver'):
                    continue
                    
                # Handle revocation (soft delete for everyone)
                if m.get('is_revoked'):
                     m['message'] = "🚫 This message was deleted"
                     m['file_url'] = None
                     m['file_type'] = None
                
                # Check clear history (Optimization: In a real app, store clear_time in user profile)
                # Here we skip optimizing clear_history query for simplicity
                
                all_msgs.append(m)
            
            # Sort by timestamp
            all_msgs.sort(key=lambda x: x['timestamp'])
            
            return all_msgs
        except Exception as e:
            print(f"Error fetching messages: {e}")
            return []

    # ================= DELETE LOGIC =================
    
    def delete_message_for_user(self, msg_id, user_id):
        """Soft deletes for one user. Hard deletes if both delete."""
        try:
            ref = self.db.collection('messages').document(msg_id)
            doc = ref.get()
            if not doc.exists: return False
            
            data = doc.to_dict()
            updates = {}
            
            is_sender = (data['sender'] == user_id)
            is_receiver = (data['receiver'] == user_id)
            
            if is_sender:
                updates['deleted_by_sender'] = True
                data['deleted_by_sender'] = True # Update local dict for check
            elif is_receiver:
                updates['deleted_by_receiver'] = True
                data['deleted_by_receiver'] = True
            
            if updates:
                # SMART DELETE CHECK
                if data.get('deleted_by_sender') and data.get('deleted_by_receiver'):
                    print(f"Smart Delete: Removing message {msg_id} entirely.")
                    ref.delete()
                else:
                    ref.update(updates)
                return True
            return False
        except Exception as e:
            print(f"Error deleting message: {e}")
            return False

    def delete_message(self, msg_id):
        """Revoke message (delete for everyone)"""
        try:
            self.db.collection('messages').document(msg_id).update({
                "message": "🚫 This message was deleted",
                "file_url": None,
                "file_type": None,
                "is_revoked": True
            })
            return True
        except:
            return False
            
    def bulk_delete_message_for_user(self, msg_ids, user_id):
        # Firestore supports batches (max 500 ops)
        try:
            batch = self.db.batch()
            count = 0
            for mid in msg_ids:
                ref = self.db.collection('messages').document(mid)
                doc = ref.get()
                if not doc.exists: continue
                
                data = doc.to_dict()
                
                # Decide what to update
                if data['sender'] == user_id:
                    # check if other deleted
                    if data.get('deleted_by_receiver'):
                        batch.delete(ref) # Both deleted -> Nuke
                    else:
                        batch.update(ref, {"deleted_by_sender": True})
                elif data['receiver'] == user_id:
                    if data.get('deleted_by_sender'):
                        batch.delete(ref)
                    else:
                        batch.update(ref, {"deleted_by_receiver": True})
                        
                count += 1
                if count >= 400: # Safety limit
                    batch.commit()
                    batch = self.db.batch()
                    count = 0
            
            if count > 0:
                batch.commit()
            return True
        except Exception as e:
            print(f"Batch delete error: {e}")
            return False

    def bulk_delete_messages(self, msg_ids):
        """Revoke multiple messages"""
        try:
            batch = self.db.batch()
            for mid in msg_ids:
                ref = self.db.collection('messages').document(mid)
                batch.update(ref, {
                    "message": "🚫 This message was deleted",
                    "file_url": None,
                    "file_type": None,
                    "is_revoked": True
                })
            batch.commit()
        except:
            pass

    # ================= STATUS & READS =================
    
    def mark_messages_read(self, sender, receiver):
        try:
            docs = self.db.collection('messages') \
                .where(filter=FieldFilter("sender", "==", sender)) \
                .where(filter=FieldFilter("receiver", "==", receiver)) \
                .where(filter=FieldFilter("status", "!=", "read")) \
                .stream()
            
            batch = self.db.batch()
            count = 0
            for doc in docs:
                batch.update(doc.reference, {"status": "read"})
                count += 1
            
            if count > 0: batch.commit()
            return count
        except:
            return 0

    def mark_message_delivered(self, msg_id):
        try:
            self.db.collection('messages').document(msg_id).update({"status": "delivered"})
            return 1
        except:
            return 0

    def mark_offline_messages_delivered(self, user_id):
        """Mark all messages sent TO user_id as delivered"""
        updated = []
        try:
            docs = self.db.collection('messages') \
                .where(filter=FieldFilter("receiver", "==", user_id)) \
                .where(filter=FieldFilter("status", "==", "sent")) \
                .stream()
            
            batch = self.db.batch()
            count = 0
            for doc in docs:
                batch.update(doc.reference, {"status": "delivered"})
                updated.append({"id": doc.id, "sender": doc.to_dict().get("sender")})
                count += 1
            
            if count > 0: batch.commit()
            return updated
        except:
            return []

    # ================= MEDIA & CONTACTS =================

    def get_chat_media(self, u1, u2):
        # Reuse get_messages_between logic but filter for file_url != None
        msgs = self.get_messages_between(u1, u2)
        return [m for m in msgs if m.get("file_url")]

    def add_contact(self, user_id, contact_id):
        try:
            # Check if contact exists as a user
            if not self.get_user_by_id(contact_id):
                return False, "User not found"
            
            # Add to user's contact subcollection
            self.db.collection('users').document(user_id).collection('contacts').document(contact_id).set({
                "contact_id": contact_id,
                "added_at": datetime.now()
            })
            return True, None
        except Exception as e:
            return False, str(e)

    def remove_contact(self, user_id, contact_id):
        try:
            self.db.collection('users').document(user_id).collection('contacts').document(contact_id).delete()
            return True
        except:
            return False

    def get_contacts(self, user_id):
        try:
            docs = self.db.collection('users').document(user_id).collection('contacts').stream()
            contacts = []
            for d in docs:
                cid = d.id
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
        # Simplified: Just Get Contacts + Recent Conversations (hard in NoSQL without denormalization)
        # For now, just return contacts to ensure basic functionality
        # In production, you'd maintain a 'recent_chats' collection for every user
        return self.get_contacts(user_id)

    # ================= BLOCK & CLEAR =================
    
    def toggle_block(self, blocker, blocked):
        try:
            ref = self.db.collection('users').document(blocker).collection('blocked').document(blocked)
            doc = ref.get()
            if doc.exists:
                ref.delete()
                return False # Unblocked
            else:
                ref.set({"timestamp": datetime.now()})
                return True # Blocked
        except:
            return False

    def is_blocked(self, u1, u2):
        # Check if u1 blocked u2 OR u2 blocked u1
        try:
            b1 = self.db.collection('users').document(u1).collection('blocked').document(u2).get().exists
            b2 = self.db.collection('users').document(u2).collection('blocked').document(u1).get().exists
            return b1 or b2
        except:
            return False

    def get_block_state(self, me, other):
        try:
            if self.db.collection('users').document(me).collection('blocked').document(other).get().exists:
                return "blocked_by_me"
            if self.db.collection('users').document(other).collection('blocked').document(me).get().exists:
                return "blocked_by_other"
            return "none"
        except:
            return "none"

    def clear_chat(self, u1, u2):
        # Optimization: In NoSQL, we usually just store a "clear_timestamp" in the relationship
        # For now, we can ignore this or implement a simple flag in a 'relationships' collection
        pass 

    # ================= ANALYTICS =================
    
    def update_login_streak(self, user_id):
        # ... logic similar to SQL but with document updates ...
        pass # Optional for basic deployment
        
    def get_profile_stats(self, user_id):
        # ... logic ...
        return {'streak': 0, 'contacts': 0, 'joined': None}

    def get_user_message_counts(self):
        # Expensive in Firestore (Read all messages). Skip for MVP.
        return {}
    
    def delete_user_data(self, user_id):
        # Complex in NoSQL. Needs recursive delete.
        # Skip for MVP.
        return False
