import mysql.connector
print("Imported mysql.connector")
try:
    pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool",
        pool_size=5,
        host="localhost",
        user="root",
        password="",
        database="socket_sync",
        use_pure=True
    )
    print("Pool created")
except Exception as e:
    print(f"Error: {e}")
