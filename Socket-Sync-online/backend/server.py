import eventlet
eventlet.monkey_patch()

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
# ... imports ...

# ... inside app setup ...
app = Flask(__name__)
# Allow CORS from specific origin in production, or * for now if strictly needed
cors_origin = "*" # FORCE WILDCARD FOR DEBUGGING
print(f"DEBUG: CORS configured for origin: {cors_origin}")
CORS(app, resources={r"/*": {"origins": cors_origin}})

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
from datetime import datetime
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from database import Database
import matplotlib
matplotlib.use('Agg') # Non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import time
import qrcode
import secrets
from io import BytesIO
from flask import send_file

# ================== APP SETUP ==================
from dotenv import load_dotenv
load_dotenv()

# ================== APP SETUP ==================
# ================== APP SETUP ==================
# Point to frontend folder for static files
# backend/server.py -> ../frontend
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../frontend")
STATIC_DIR = TEMPLATE_DIR

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)

# Allow CORS from specific origin in production, or * for now if strictly needed
cors_origin = "*" # Unified deployment: Same origin, but keep * for dev
print(f"DEBUG: CORS configured for origin: {cors_origin}")
CORS(app, resources={r"/*": {"origins": cors_origin}})

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# ================== FRONTEND ROUTES ==================
@app.route("/")
def index():
    # serve login.html as the landing page
    return send_from_directory(os.path.join(TEMPLATE_DIR, "pages"), "login.html")

@app.route("/login")
def login_page():
    return send_from_directory(os.path.join(TEMPLATE_DIR, "pages"), "login.html")

@app.route("/signup")
def signup_page():
    return send_from_directory(os.path.join(TEMPLATE_DIR, "pages"), "signup.html")

@app.route("/chat")
def chat():
    return send_from_directory(os.path.join(TEMPLATE_DIR, "pages"), "chat.html")

@app.route("/oauth-callback")
def oauth_callback():
    return send_from_directory(os.path.join(TEMPLATE_DIR, "pages"), "oauth-callback.html")

# Serve Static Assets (CSS, JS, Material, etc.)
# Since files are in ../frontend/css, ../frontend/js
@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "css"), filename)

@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "js"), filename)

@app.route("/material/<path:filename>")
def serve_material(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "material"), filename)
    
@app.route("/pages/<path:filename>")
def serve_pages(filename):
    return send_from_directory(os.path.join(STATIC_DIR, "pages"), filename)

# ================== DATABASE ==================
db = Database()

# ================== FILE UPLOAD CONFIG ==================
# Files are in root/uploads, server is in root/backend. So -> ../uploads
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "../uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# ================== SERVE UPLOADED FILES ==================
@app.get("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

# ================== AUTH ==================
@app.post("/signup")
def signup():
    data = request.json
    # Hash the password before saving
    data["password"] = generate_password_hash(data["password"])
    
    success, error = db.create_user(data)
    if success:
        return jsonify(success=True)
    return jsonify(error=error), 400

@app.post("/login")
def login():
    data = request.json
    user_id = data["userId"]
    input_pw = data["password"]

    user = db.get_user_by_id(user_id)
    
    if user:
        stored_pw = user["password"]
        
        # 1. Check if it's a valid hash
        if check_password_hash(stored_pw, input_pw):
            # Update login streak
            db.update_login_streak(user_id)
            
            # Clean password from response
            del user["password"]
            return jsonify(user)

    return jsonify(error="Invalid credentials"), 401

@app.post("/login/qr")
def login_qr():
    data = request.json
    token = data.get("token")
    user = db.get_user_by_qr_token(token)
    if user:
        # Invalidate token after use? Optional. For persistent "ID card" style, keep it.
        # User requested "unique qr code for every unique user", implies it's static-ish.
        return jsonify(user)
    return jsonify(error="Invalid QR Token"), 401

@app.post("/social-login")
def social_login():
    data = request.json
    email = data.get("email")
    name = data.get("name")
    avatar = data.get("avatar")
    
    if not email:
        return jsonify(error="Email is required"), 400
        
    # Check if user exists
    user = db.get_user_by_id(email)
    
    if user:
        # Login
        # Update avatar if changed? Optional.
        # db.update_avatar(email, avatar)
        
        # Remove password from response
        if "password" in user:
            del user["password"]
            
        db.update_login_streak(email)
        return jsonify(user)
    else:
        # Signup
        # Generate random password
        random_pw = secrets.token_urlsafe(16)
        hashed_pw = generate_password_hash(random_pw)
        
        new_user = {
            "userId": email,
            "name": name,
            "password": hashed_pw,
            "avatar": avatar or f"https://ui-avatars.com/api/?name={name}"
        }
        
        success, error = db.create_user(new_user)
        if success:
            # Return user data without password
            del new_user["password"]
            return jsonify(new_user)
        else:
            return jsonify(error=error), 400


@app.post("/user/avatar")
def update_avatar_endpoint():
    data = request.json
    uid = data.get("userId")
    avatar_url = data.get("avatarUrl")
    
    if db.update_avatar(uid, avatar_url):
        return jsonify(success=True)
    return jsonify(error="Failed to update avatar"), 500

@app.get("/user/<user_id>/qr")
def get_user_qr(user_id):
    # 1. Generate or retrieve token
    # For simplicity, we generate a new one if not exists, or update it.
    # To keep it "unique for every user" (persistent), we could check if one exists.
    # But simple approach: Update with a new random token ensuring security (rotation).
    # If user wants "static" ID card, we should store it once.
    # Let's verify password? No, this is an authenticated endpoint usually.
    # We will assume this is called by the LOGGED IN user to see their profile.
    
    # 1. Check if token exists (Static QR)
    token = db.get_qr_token(user_id)
    
    if not token:
        # Generate new if none exists
        token = secrets.token_urlsafe(32)
        db.update_qr_token(user_id, token)
    
    # 2. Generate QR
    # QR Content: JSON string to be parsed by scanner
    qr_content = f'{{"type":"login", "token":"{token}"}}'
    
    img = qrcode.make(qr_content)
    buf = BytesIO()
    img.save(buf)
    buf.seek(0)
    
    return send_file(buf, mimetype="image/png")

# ================== USERS ==================
@app.get("/users")
def users():
    return jsonify(db.get_all_users())

@app.delete("/user/delete")
def delete_user():
    data = request.json
    user_id = data.get("userId")
    
    if not user_id:
        return jsonify(error="User ID required"), 400
        
    if db.delete_user_data(user_id):
        return jsonify(success=True)
    return jsonify(error="Failed to delete user"), 500

# ================== PROFILE STATS ==================
@app.get("/user/<user_id>/stats")
def get_profile_stats(user_id):
    stats = db.get_profile_stats(user_id)
    return jsonify(stats)

# ================= CONTACTS =================
@app.get("/contacts")
def get_contacts():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify(error="Missing user_id"), 400
    return jsonify(db.get_contacts(user_id))

@app.post("/contacts/add")
def add_contact():
    data = request.json
    user_id = data.get("user_id")
    contact_id = data.get("contact_id")
    
    if not user_id or not contact_id:
        return jsonify(error="Missing IDs"), 400
        
    if user_id == contact_id:
        return jsonify(error="Cannot add yourself"), 400
        
    success, error = db.add_contact(user_id, contact_id)
    if success:
        return jsonify(success=True)
    return jsonify(error=error), 400

@app.post("/contacts/remove")
def remove_contact():
    data = request.json
    user_id = data.get("user_id")
    contact_id = data.get("contact_id")
    
    if db.remove_contact(user_id, contact_id):
        return jsonify(success=True)
    return jsonify(error="Failed to remove"), 400

@app.get("/chat-list")
def get_chat_list():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify(error="Missing user_id"), 400
    return jsonify(db.get_chat_list(user_id))

# ================== LOAD MESSAGES ==================
@app.get("/messages")
def messages():
    u1 = request.args.get("u1")
    u2 = request.args.get("u2")
    return jsonify(db.get_messages_between(u1, u2))

# ================== FILE UPLOAD API ==================
@app.post("/upload")
def upload_file():
    if "file" not in request.files:
        return jsonify(error="No file"), 400

    file = request.files["file"]
    filename = secure_filename(file.filename)

    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(path)

    return jsonify(
        file_url=f"/uploads/{filename}",
        file_type=file.content_type
    )

@app.get("/chat/<partner_id>/media")
def get_media(partner_id):
    u1 = request.args.get("u1") # Current user
    return jsonify(db.get_chat_media(u1, partner_id))

# ================== SOCKET EVENTS ==================
@socketio.on("join")
def handle_join(data):
    room = data["room"]
    join_room(room)
    
    # If a user is joining their personal room (which matches their user_id),
    # Check for offline messages waiting for them
    # We remove the heuristic check because proper UserIDs might contain hyphens.
    # The DB query `receiver = room` acts as the validation.
    
    updated_msgs = db.mark_offline_messages_delivered(room)
    
    # 3. Notify original senders (Group by sender for efficiency)
    senders_to_notify = {}
    for msg in updated_msgs:
        s = msg["sender"]
        if s not in senders_to_notify: senders_to_notify[s] = []
        senders_to_notify[s].append(msg["id"])
        
    for sender_id, ids in senders_to_notify.items():
        # Emit to sender's personal room
        emit("bulk_message_delivered", {
            "ids": ids,
            "status": "delivered"
        }, room=sender_id)

@socketio.on("send_message")
def handle_message(data):
    sender = data["from"]
    receiver = data["to"]
    text = data.get("text")
    file_url = data.get("file_url")
    file_type = data.get("file_type")
    room = data["room"]

    now = datetime.now().astimezone()

    msg_data = {
        "sender": sender,
        "receiver": receiver,
        "message": text,
        "file_url": file_url,
        "file_type": file_type,
        "timestamp": now
    }
    
    print(f"DEBUG: Processing message from {sender} to {receiver}")

    # Check Block
    if db.is_blocked(sender, receiver):
        print(f"DEBUG: Blocked message attempt")
        emit("error", {"message": "Message not sent. You are blocked or have blocked this user."}, room=room)
        return

    new_id = db.save_message(msg_data)
    print(f"DEBUG: Message saved with ID: {new_id}")
    
    if not new_id:
        print("CRITICAL: save_message returned None!")
        emit("error", {"message": "Failed to save message"}, room=room)
        return

    emit(
        "receive_message",
        {
            "id": new_id,
            "from": sender,
            "to": receiver,
            "message": text,
            "file_url": file_url,
            "file_type": file_type,
            "timestamp": now.isoformat(),
            "status": "sent" # Default
        },
        room=room,
        include_self=False
    )
    
    # ALSO Emit to Receiver's Personal Room (for ignored/background notifications)
    # This ensures they get 'double gray tick' even if they haven't opened this specific chat
    # provided they are online (joined their own room).
    emit(
        "receive_message",
        {
            "id": new_id,
            "from": sender,
            "to": receiver,
            "message": text,
            "file_url": file_url,
            "file_type": file_type,
            "timestamp": now.isoformat(),
            "status": "sent"
        },
        room=receiver
    )
    
    # Emit back to sender to update their temporary message with the real ID
    print(f"DEBUG: Emitting confirmation to sender for temp_id: {data.get('temp_id')}")
    emit("message_sent_confirm", {
        "temp_id": data.get("temp_id"), 
        "id": new_id,
        "timestamp": now.isoformat(),
        "status": "sent"
    })

@app.delete("/messages/<int:msg_id>")
def delete_message(msg_id):
    # In a real app, verify 'sender' matches current user
    db.delete_message(msg_id)
    return jsonify(success=True)

@socketio.on("delete_message")
def handle_delete(data):
    msg_id = data.get("id")
    if not msg_id: return
    
    # 1. Get message to find participants
    msg = db.get_message_by_id(msg_id)
    if not msg: return
    
    sender = msg["sender"]
    receiver = msg["receiver"]
    
    # 2. Perform soft delete
    db.delete_message(msg_id)
    
    # 3. Broadcast revocation
    payload = {
        "id": msg_id,
        "message": "🚫 This message was deleted"
    }
    
    # Shared pair room
    pair_room = "-".join(sorted([sender, receiver]))
    emit("message_revoked", payload, room=pair_room)
    
    # Personal rooms (Crucial for background/chat-list updates)
    emit("message_revoked", payload, room=sender)
    emit("message_revoked", payload, room=receiver)

@socketio.on("bulk_delete_message")
def handle_bulk_delete(data):
    # data = { ids: [1, 2, 3], room: "..." }
    msg_ids = data.get("ids", [])
    if not msg_ids: return
    
    # Get participants from first message to broadcast correctly
    first_msg = db.get_message_by_id(msg_ids[0])
    if not first_msg: return
    
    sender = first_msg["sender"]
    receiver = first_msg["receiver"]
    
    db.bulk_delete_messages(msg_ids)
    
    payload = {
        "ids": msg_ids,
        "message": "🚫 This message was deleted"
    }
    
    pair_room = "-".join(sorted([sender, receiver]))
    emit("bulk_message_revoked", payload, room=pair_room)
    emit("bulk_message_revoked", payload, room=sender)
    emit("bulk_message_revoked", payload, room=receiver)

@socketio.on("delete_for_me")
def handle_delete_for_me(data):
    # data = { "id": 123, "user_id": "..." }
    msg_id = data["id"]
    user_id = data["user_id"]
    
    if db.delete_message_for_user(msg_id, user_id):
        # Only notify the requester
        emit("message_deleted", {"id": msg_id}, room=user_id)

@socketio.on("bulk_delete_for_me")
def handle_bulk_delete_for_me(data):
    # data = { "ids": [1, 2, 3], "user_id": "..." }
    msg_ids = data.get("ids", [])
    user_id = data.get("user_id")
    if not msg_ids or not user_id: return
    
    db.bulk_delete_message_for_user(msg_ids, user_id)
    # Notify just the user's personal room
    emit("bulk_message_deleted", {"ids": msg_ids}, room=user_id)

@socketio.on("read_messages")
def handle_read_messages(data):
    # data: { sender: "the_guy_who_sent_msgs", receiver: "me(reader)" }
    sender = data.get("sender")
    receiver = data.get("receiver") # Me
    
    if sender and receiver:
        # Mark in DB
        count = db.mark_messages_read(sender, receiver)
        
        # Notify the sender that 'receiver' has read their messages
        # We need to emit to the sender's room OR the common room.
        # Common room is easier if both are joined.
        room_name = "-".join(sorted([sender, receiver]))
        
        emit("messages_read", {
            "by": receiver,
            "read_all_from": sender
        }, room=room_name)

@socketio.on("delivery_receipt")
def handle_delivery_receipt(data):
    # data: { msg_id: 123, sender: "sender_id", receiver: "me" }
    msg_id = data.get("msg_id")
    sender = data.get("sender")
    
    if msg_id and sender:
        db.mark_message_delivered(msg_id)
        
        # Notify sender
        # We can send to sender's personal room or the pair room
        room_name = "-".join(sorted([sender, data.get("receiver")]))
        emit("message_delivered", {
            "id": msg_id,
            "status": "delivered"
        }, room=room_name)


@socketio.on("typing")
def handle_typing(data):
    # data: { to: "userb", from: "usera", typing: true/false }
    emit("user_typing", {
        "from": data.get("from"),
        "typing": data.get("typing", False)
    }, room=data["to"], include_self=False)

@app.route('/stats', methods=['GET'])
def get_stats():
    try:
        data = db.get_user_message_counts()
        names = list(data.keys())
        counts = list(data.values())
        
        # NumPy for calculations (Syllabus Requirement: Unit 9)
        avg_msgs = np.mean(counts) if counts else 0
        
        # Matplotlib for Visualization (Syllabus Requirement: Unit 10)
        plt.figure(figsize=(10, 6))
        
        # Create bars
        colors = plt.cm.viridis(np.linspace(0, 1, len(names)))
        bars = plt.bar(names, counts, color=colors)
        
        plt.axhline(avg_msgs, color='r', linestyle='--', label=f'Average ({avg_msgs:.1f})')
        plt.title('User Activity: Messages Sent')
        plt.xlabel('Users')
        plt.ylabel('Message Count')
        plt.legend()
        plt.xticks(rotation=45)
        plt.tight_layout()
        
        # Save plot
        filename = f"activity_plot_{int(time.time())}.png"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        plt.savefig(filepath)
        plt.close()
        
        return jsonify({
            "plot_url": f"/uploads/{filename}",
            "stats": {
                "total_messages": sum(counts),
                "average_per_user": float(avg_msgs),
                "most_active": names[np.argmax(counts)] if counts else "None"
            }
        })
    except Exception as e:
        print(f"Stats error: {e}")
        return jsonify({"error": str(e)}), 500

@app.post("/user/block")
def toggle_block():
    data = request.json
    blocker = data.get("blocker") # Current user
    blocked = data.get("blocked") # Target
    
    # Ideally verify blocker matches session/token
    state = db.toggle_block(blocker, blocked)
    return jsonify(blocked=state)

@app.get("/user/block_state")
def get_block_state():
    u1 = request.args.get("u1")
    u2 = request.args.get("u2")
    return jsonify(state=db.get_block_state(u1, u2))

@app.delete("/chat/<target_id>")
def clear_chat(target_id):
    u1 = request.args.get("u1")
    db.clear_chat(u1, target_id)
    return jsonify(success=True)

# ================== DASHBOARD AUTOMATION ==================
import subprocess
import socket
import sys

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

@app.post("/start-dashboard")
def start_dashboard():
    try:
        if is_port_in_use(8501):
            return jsonify({"status": "running", "message": "Dashboard already running"})
        
        # Path to dashboard script
        dashboard_path = os.path.join(BASE_DIR, "../analytics/dashboard.py")
        
        # Determine python executable
        python_exe = sys.executable
        
        # subprocess.Popen matches non-blocking behavior
        # shell=True might be needed on Windows for path resolution, but generally list args is safer.
        # However, "streamlit" might be a script. Better to use `python -m streamlit run ...`
        
        cmd = [python_exe, "-m", "streamlit", "run", dashboard_path, "--server.port=8501", "--server.headless=true"]
        
        subprocess.Popen(cmd, cwd=os.path.join(BASE_DIR, ".."))
        
        return jsonify({"status": "started", "message": "Dashboard process initiated"})
    except Exception as e:
        print(f"Failed to start dashboard: {e}")
        return jsonify({"error": str(e)}), 500

# ================== RUN ==================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # In production (when run directly), debug should likely be False, but we keep it True for now as requested/defaults
    # However, Gunicorn will likely bypass this block entirely.
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
