from backend.database import Database

def test_add_contact():
    db = Database()
    
    # IDs from the user's scenario
    user_id = "jay1234@gmail.com"
    contact_id = "kaushalchau.2007@gmail.com"
    
    print(f"Attempting to add contact '{contact_id}' for user '{user_id}'...")
    
    # 1. Check if contact exists directly
    print(f"Checking get_user_by_id('{contact_id}')...")
    u = db.get_user_by_id(contact_id)
    if u:
        print(f"Found user: {u.get('name')}")
    else:
        print("User NOT found by get_user_by_id")
        
    # 2. Try add_contact
    print("Calling db.add_contact...")
    success, error = db.add_contact(user_id, contact_id)
    if success:
        print("add_contact Successful!")
    else:
        print(f"add_contact Failed: {error}")

if __name__ == "__main__":
    test_add_contact()
