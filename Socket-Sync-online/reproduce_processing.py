import sys
import os
import mysql.connector
import pandas as pd

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from database import Database
except ImportError as e:
    print(f"Failed to import Database: {e}")
    sys.exit(1)

conn = None
try:
    db = Database()
    conn = db.get_connection()
    
    # helper 1
    query = "SELECT sender, receiver, timestamp, file_type FROM messages"
    df = pd.read_sql(query, conn)
    
    # helper 2
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT user_id, name FROM users")
    users_map = {u['user_id']: u['name'] for u in cur.fetchall()}
    
    if not df.empty:
        print("Data loaded. Rows:", len(df))
        
        # Processing steps from dashboard.py
        print("Converting timestamp...")
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        print("Mapping senders...")
        df['sender_name'] = df['sender'].map(users_map)
        
        print("Mapping receivers...")
        df['receiver_name'] = df['receiver'].map(users_map)
        
        print("Extracting hour/date...")
        df['hour'] = df['timestamp'].dt.hour
        df['date'] = df['timestamp'].dt.date
        
        print("Processing complete.")
        print(df.head())
        
        # Check for NaNs in names if that causes issues?
        if df['sender_name'].isna().any():
            print("WARNING: Some sender_names are NaN")
            
    else:
        print("DataFrame is empty.")

except Exception as e:
    print(f"CRASHED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    if conn:
        conn.close()
