import sys
import os
import mysql.connector
import pandas as pd

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from database import Database
    print("Database module imported successfully.")
except ImportError as e:
    print(f"Failed to import Database: {e}")
    sys.exit(1)

conn = None
try:
    db = Database()
    print("Database instance created.")
    conn = db.get_connection()
    print("Database connection established.")
    
    query = "SELECT sender, receiver, timestamp, file_type FROM messages"
    df = pd.read_sql(query, conn)
    print("Query executed successfully.")
    print("Dataframe shape:", df.shape)
    print(df.head())
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
finally:
    if conn:
        conn.close()
        print("Connection closed.")
