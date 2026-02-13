from backend.database import Database
import json

def list_users():
    db = Database()
    print("Fetching users...")
    users = db.get_all_users()
    print(f"Found {len(users)} users:")
    for u in users:
        print(f" - ID: {u['user_id']} (Name: {u['name']})")
        # Also print the raw key if possible, but get_all_users returns list of dicts.
        # Let's inspect raw if we can
    
    # Debug raw keys
    raw_users = db.users_ref.get()
    print("\nRaw Keys in DB:")
    if raw_users:
        for k in raw_users.keys():
            print(f" - {k}")
    else:
        print(" - None")

if __name__ == "__main__":
    list_users()
