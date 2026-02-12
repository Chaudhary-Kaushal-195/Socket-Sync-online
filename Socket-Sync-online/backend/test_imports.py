import os
print("os imported", flush=True)
from flask import Flask, request, jsonify, send_from_directory
print("flask imported", flush=True)
from flask_cors import CORS
print("flask_cors imported", flush=True)
from flask_socketio import SocketIO, emit, join_room
print("flask_socketio imported", flush=True)
from datetime import datetime
print("datetime imported", flush=True)
from werkzeug.utils import secure_filename
print("werkzeug imported", flush=True)
from database import Database
print("database imported", flush=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
print("matplotlib imported", flush=True)
import numpy as np
print("numpy imported", flush=True)
import time
import qrcode
import secrets
from io import BytesIO
print("others imported", flush=True)

print("Initializing Flask...", flush=True)
app = Flask(__name__)
CORS(app)
print("Flask initialized", flush=True)

print("Initializing SocketIO...", flush=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
print("SocketIO initialized", flush=True)

print("Initializing Database...", flush=True)
try:
    db = Database()
    print("Database initialized", flush=True)
except Exception as e:
    print(f"Database init failed: {e}", flush=True)

print("Setup done.", flush=True)
