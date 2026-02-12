import mysql.connector
from backend.database import Database

def test_retrieval():
    db = Database()
    
    # Simulate valid users (ensure these exist or use placeholders that won't crash)
    # Getting some users from DB first to be safe
    conn = None
    try:
        conn = db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM users LIMIT 2")
        users = cur.fetchall()
    finally:
        if conn:
            conn.close()
    
    if len(users) < 2:
        print("Not enough users to test.")
        return

    u1 = users[0][0]
    u2 = users[1][0]
    
    print(f"Testing retrieval between {u1} and {u2}...")
    
    try:
        msgs = db.get_messages_between(u1, u2)
        print(f"Success! Retrieved {len(msgs)} messages.")
        if len(msgs) > 0:
            print("Sample message keys:", msgs[0].keys())
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_retrieval()
