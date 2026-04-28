import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, MessageSquare, Activity } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, messages: 0 });

  useEffect(() => {
    // In a real implementation, you would fetch real stats from the backend.
    // For this migration, we'll just mock it or fetch basic data.
    fetch('http://localhost:5000/users')
      .then(res => res.json())
      .then(data => setStats(prev => ({ ...prev, users: data.length })))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <button 
        onClick={() => navigate('/chat')}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-semibold mb-8 transition-colors"
      >
        <ArrowLeft size={20} /> Back to Chat
      </button>

      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-8 flex items-center gap-3">
          <Activity className="text-indigo-600" size={32} />
          Analytics Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center transform hover:-translate-y-1 transition-transform">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
              <Users size={32} />
            </div>
            <h3 className="text-slate-500 font-medium mb-1">Total Users</h3>
            <p className="text-4xl font-black text-slate-800">{stats.users}</p>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center transform hover:-translate-y-1 transition-transform">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
              <MessageSquare size={32} />
            </div>
            <h3 className="text-slate-500 font-medium mb-1">Total Messages</h3>
            <p className="text-4xl font-black text-slate-800">100+</p>
          </div>
          
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-6 rounded-3xl shadow-md text-white flex flex-col justify-center">
            <h3 className="text-indigo-100 font-medium mb-2">System Status</h3>
            <p className="text-2xl font-bold mb-4">All Systems Operational</p>
            <div className="flex items-center gap-2 text-sm text-indigo-200">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              Real-time socket connected
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
