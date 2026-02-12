import sys
import os
import time

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import Database

def test_smart_delete():
    print("Initializing Database...")
    db = Database()
    if not db.db:
        print("FAIL: Database not initialized. Check serviceAccountKey.json")
        return

    print("Creating test users...")
    u1 = {"userId": "test_user_1", "name": "Tester 1", "password": "pw", "avatar": "av"}
    u2 = {"userId": "test_user_2", "name": "Tester 2", "password": "pw", "avatar": "av"}
    
    db.create_user(u1)
    db.create_user(u2)
    
    print("Sending message...")
    msg = {
        "sender": u1["userId"],
        "receiver": u2["userId"],
        "message": "Hello World",
        "file_url": None,
        "file_type": None
    }
    msg_id = db.save_message(msg)
    
    if not msg_id:
        print("FAIL: Message not saved")
        return
    print(f"Message ID: {msg_id}")
    
    # Test 1: Soft delete by sender
    print("Deleting by Sender (Soft)...")
    db.delete_message_for_user(msg_id, u1["userId"])
    
    m = db.get_message_by_id(msg_id)
    if m and m['deleted_by_sender'] and not m['deleted_by_receiver']:
        print("PASS: Sender soft delete working")
    else:
        print("FAIL: Sender soft delete failed")
        
    # Test 2: Smart Delete (Receiver deletes)
    print("Deleting by Receiver (Hard/Smart)...")
    db.delete_message_for_user(msg_id, u2["userId"])
    
    m = db.get_message_by_id(msg_id)
    if m is None:
        print("PASS: Smart Delete worked! Document is gone.")
    else:
        print(f"FAIL: Document still exists: {m}")

if __name__ == "__main__":
    test_smart_delete()
