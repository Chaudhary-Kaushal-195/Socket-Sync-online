import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Send, LogOut, Paperclip, Activity } from 'lucide-react';

export default function Chat() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    newSocket.emit('join', { room: parsedUser.user_id });

    newSocket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => newSocket.disconnect();
  }, [navigate]);

  useEffect(() => {
    if (activeChat && socket) {
      const room = [user.user_id, activeChat.user_id].sort().join('-');
      socket.emit('join', { room });
      
      // Fetch history
      fetch(`http://localhost:5000/messages?u1=${user.user_id}&u2=${activeChat.user_id}`)
        .then(res => res.json())
        .then(data => setMessages(data))
        .catch(err => console.error("Failed to load messages", err));
    }
  }, [activeChat, socket, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;

    const tempId = Date.now().toString();
    const msgData = {
      from: user.user_id,
      to: activeChat.user_id,
      text: inputMessage,
      room: [user.user_id, activeChat.user_id].sort().join('-'),
      temp_id: tempId
    };

    socket.emit('send_message', msgData);
    
    // Optimistic UI update
    setMessages(prev => [...prev, {
      id: tempId,
      from: user.user_id,
      to: activeChat.user_id,
      message: inputMessage,
      timestamp: new Date().toISOString(),
      status: 'sending'
    }]);

    setInputMessage('');
  };

  // Dummy contacts for now, in reality fetch from /users or /contacts
  useEffect(() => {
    // We will just fetch all users as contacts for demo
    fetch('http://localhost:5000/users')
      .then(res => res.json())
      .then(data => {
        if(user) {
          setContacts(data.filter(u => u.user_id !== user.user_id));
        }
      });
  }, [user]);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-indigo-600 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <img src={user.avatar} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-white/30" />
            <h2 className="font-semibold">{user.name}</h2>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <LogOut size={18} />
          </button>
        </div>
        
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contacts</h3>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-semibold bg-indigo-50 px-2 py-1 rounded-md transition-colors">
            <Activity size={14} /> Dashboard
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.map((contact) => (
            <div 
              key={contact.user_id}
              onClick={() => setActiveChat(contact)}
              className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-slate-50 ${activeChat?.user_id === contact.user_id ? 'bg-indigo-50/80 border-l-4 border-l-indigo-600' : 'hover:bg-slate-100 border-l-4 border-l-transparent'}`}
            >
              <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full shadow-sm" />
              <div>
                <h4 className="font-medium text-slate-800">{contact.name}</h4>
                <p className="text-xs text-slate-500 truncate w-40">Tap to chat</p>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
             <div className="p-6 text-center text-slate-400 text-sm">No contacts available. Open another browser to create an account!</div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50/50">
        {activeChat ? (
          <>
            <div className="p-4 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center gap-4 shadow-sm z-10 sticky top-0">
              <img src={activeChat.avatar} alt="Avatar" className="w-10 h-10 rounded-full shadow-sm" />
              <div>
                <h3 className="font-semibold text-slate-800">{activeChat.name}</h3>
                <p className="text-xs text-green-500 font-medium tracking-wide">Online</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => {
                const isMe = msg.from === user.user_id || msg.sender === user.user_id;
                return (
                  <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-4 rounded-2xl shadow-sm ${isMe ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'}`}>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                      <span className={`text-[10px] mt-2 block ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200">
              <form onSubmit={sendMessage} className="flex gap-2 items-center bg-slate-100 p-2 rounded-full border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-transparent transition-all shadow-inner">
                <button type="button" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-full hover:bg-white">
                  <Paperclip size={20} />
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-transparent border-none focus:outline-none px-2 text-slate-700"
                />
                <button 
                  type="submit" 
                  disabled={!inputMessage.trim()}
                  className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-full transition-colors shadow-md transform active:scale-95 disabled:active:scale-100"
                >
                  <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Send size={40} className="text-indigo-400 translate-x-1" />
            </div>
            <h2 className="text-2xl font-bold text-slate-600 mb-2">SocketSync Web</h2>
            <p className="max-w-xs text-center text-sm leading-relaxed">Select a chat from the sidebar to start sending real-time messages.</p>
          </div>
        )}
      </div>
    </div>
  );
}
