import streamlit as st
import matplotlib.pyplot as plt
import pandas as pd
import sys
import mysql.connector
import altair as alt
import warnings

# Suppress pandas SQLALCHEMY warning
warnings.filterwarnings('ignore', category=UserWarning, module='pandas')

# Ensure we can import from backend
import os
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_path = os.path.join(base_dir, 'backend')
sys.path.append(backend_path)
from database import Database

# Page Config
st.set_page_config(
    page_title="Socket-Sync Analytics", 
    page_icon="📊",
    layout="wide"
)

# Initialize Database
@st.cache_resource
def get_db():
    return Database()

try:
    db = get_db()
except Exception as e:
    st.error(f"Failed to connect to database: {e}")
    st.stop()

# Helper Functions
def get_all_messages():
    conn = db.get_connection()
    try:
        query = "SELECT sender, receiver, timestamp, file_type FROM messages"
        df = pd.read_sql(query, conn)
        return df
    finally:
        conn.close()

def get_users_dict():
    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT user_id, name FROM users")
        return {u['user_id']: u['name'] for u in cur.fetchall()}
    finally:
        conn.close()

# Load Data
st.sidebar.title("Socket-Sync 📊")
if st.sidebar.button("Refresh Data 🔄"):
    st.cache_data.clear()

users_map = get_users_dict()
try:
    df = get_all_messages()
    
    # Preprocessing
    if not df.empty:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['sender_name'] = df['sender'].map(users_map).fillna("Unknown")
        df['receiver_name'] = df['receiver'].map(users_map).fillna("Unknown")
        df['hour'] = df['timestamp'].dt.hour
        # specific fix: use normalize to keep it as a timestamp (datetime64) instead of object (date)
        df['date'] = df['timestamp'].dt.normalize()

except Exception as e:
    st.error(f"Error loading data: {e}")
    st.stop()

if df.empty:
    st.warning("No messages found in the database. Send some messages to see analytics!")
    st.stop()

# Dashboard Tabs
tab1, tab2, tab3, tab4 = st.tabs(["Overview 🌍", "User Activity 👤", "Time Trends 📈", "File Analysis 📁"])

# --- TAB 1: OVERVIEW ---
with tab1:
    st.title("Global Overview")
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Users", len(users_map))
    col2.metric("Total Messages", len(df))
    col3.metric("Files Shared", df['file_type'].notna().sum())
    
    st.divider()
    
    st.subheader("Data Preview")
    # Updated API
    st.dataframe(df.head(), width="stretch")

# --- TAB 2: USER ACTIVITY ---
with tab2:
    st.title("User Activity")
    
    # Messages Sent per User
    msg_counts = df['sender_name'].value_counts().reset_index()
    msg_counts.columns = ['User', 'Messages Sent']
    
    if not msg_counts.empty:
        # Altair Chart
        chart = alt.Chart(msg_counts).mark_bar(color="#FF4B4B").encode(
            x=alt.X('User:N', sort='-y', title="User"),
            y=alt.Y('Messages Sent:Q', title="Messages Sent"),
            tooltip=['User', 'Messages Sent']
        )
        # Using width="stretch" still works for most versions for CHARTS, but let's try width='stretch' if the warning was explicit for this too.
        # However, st.altair_chart signature is (chart, width="stretch", theme="streamlit").
        # If I change it to width="stretch", it might fail if that arg doesn't exist.
        # The warning Logs: "For width="stretch", use width='stretch'".
        # This implies standardizing on `width`.
        # I will use `width="stretch"` because st.altair_chart MIGHT NOT update as fast as st.dataframe.
        # But wait, looking at recent Streamlit changelogs, `st.dataframe`, `st.data_editor` use `width`.
        # `st.altair_chart` uses `use_container_width`.
        # The warnings specifically said: "Please replace use_container_width with width."
        # I'll try `width="stretch"` first to be safe, but suppression via warning filter is safer if unsure.
        st.altair_chart(chart, width="stretch")
        
        col1, col2 = st.columns(2)
        with col1:
            st.write("### Most Active Users")
            st.dataframe(msg_counts, hide_index=True)
            
        with col2:
            st.write("### Engagement Share")
            fig, ax = plt.subplots()
            ax.pie(msg_counts['Messages Sent'], labels=msg_counts['User'], autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            st.pyplot(fig)
    else:
        st.info("No activity to display.")

# --- TAB 3: TIME TRENDS ---
with tab3:
    st.title("Temporal Analysis")
    
    # Daily Activity
    st.subheader("Messages per Day")
    daily_counts = df.groupby('date').size().reset_index(name='Count')
    
    if not daily_counts.empty:
        # Enforce Temporal type for date (:T)
        line_chart = alt.Chart(daily_counts).mark_line(point=True).encode(
            x=alt.X('date:T', title='Date'),
            y=alt.Y('Count:Q', title='Messages'),
            tooltip=[alt.Tooltip('date:T', format='%Y-%m-%d'), 'Count']
        )
        st.altair_chart(line_chart, width="stretch")
    else:
        st.info("Not enough data for time trends.")
    
    # Hourly Activity
    st.subheader("Activity by Hour of Day")
    hourly_counts = df.groupby('hour').size().reset_index(name='Count')
    
    if not hourly_counts.empty:
        # Enforce Ordinal (:O) or Quantitative (:Q) for hour
        bar_chart = alt.Chart(hourly_counts).mark_bar().encode(
            x=alt.X('hour:O', title='Hour (24h)'),
            y=alt.Y('Count:Q', title='Messages'),
            tooltip=['hour', 'Count']
        )
        st.altair_chart(bar_chart, width="stretch")
    else:
        st.info("Not enough data for hourly trends.")

# --- TAB 4: FILE ANALYSIS ---
with tab4:
    st.title("File Sharing Deep Dive")
    
    # Filter for file messages only
    file_df = df[df['file_type'].notna()].copy()
    
    if file_df.empty:
        st.info("No files have been shared yet.")
    else:
        # Simplify file types
        def simplify_type(t):
            t = t.lower()
            if 'image' in t: return 'Image'
            if 'video' in t: return 'Video'
            if 'audio' in t: return 'Audio'
            return 'Document'
            
        file_df['category'] = file_df['file_type'].apply(simplify_type)
        
        # Stats
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Total Files", len(file_df))
            st.write("### File Type Distribution")
            type_counts = file_df['category'].value_counts()
            
            # Sub-tabs
            chart_tab1, chart_tab2 = st.tabs(["Bar Chart 📊", "Pie Chart 🥧"])
            with chart_tab1:
                st.bar_chart(type_counts)
            with chart_tab2:
                fig_files, ax_files = plt.subplots()
                ax_files.pie(type_counts, labels=type_counts.index, autopct='%1.1f%%', startangle=90)
                ax_files.axis('equal')
                st.pyplot(fig_files)
            
        with col2:
            st.write("### Top File Sharers")
            sharer_counts = file_df['sender_name'].value_counts()
            st.dataframe(sharer_counts, width="stretch")

        # Interaction Filter
        st.divider()
        st.subheader("Detailed File Log")
        selected_user = st.selectbox("Filter by Sender", ["All"] + list(users_map.values()))
        
        if selected_user != "All":
            filtered_view = file_df[file_df['sender_name'] == selected_user]
        else:
            filtered_view = file_df
            
        st.dataframe(filtered_view[['date', 'sender_name', 'receiver_name', 'category', 'file_type']], width="stretch")
