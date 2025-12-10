import React, { useState, useEffect, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { 
  LayoutGrid, Play, Upload, Users, LogOut, Search, Bell, 
  ThumbsUp, ThumbsDown, X, Trash2, CheckCircle, XCircle, Clock, AlertCircle
} from 'lucide-react';
import './App.css';

const API = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

const AuthCtx = React.createContext();

// --- APP ROOT ---
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setUser(res.data.user))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  if (loading) return <div className="flex-center" style={{height:'100vh', color:'#6366f1'}}>Initializing PulseGen...</div>;

  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/*" element={user ? <DashboardLayout /> : <Navigate to="/auth" />} />
        </Routes>
      </Router>
    </AuthCtx.Provider>
  );
}

// --- AUTH COMPONENT ---
function AuthPage() {
  const { setUser } = useContext(AuthCtx);
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', username: '', role: 'viewer' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const res = await axios.post(`${API}${endpoint}`, form);
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      navigate('/');
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="brand flex-center" style={{marginBottom:'2rem', fontSize:'1.5rem'}}>
          <Play fill="currentColor" /> PulseGen
        </div>
        <h2 style={{marginBottom:'1.5rem', textAlign:'center'}}>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
        <form onSubmit={submit}>
          {isRegister && (
            <>
              <input className="input-field" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} required />
              <select className="input-field" onChange={e => setForm({...form, role: e.target.value})}>
                <option value="viewer">Viewer (Watch & Vote)</option>
                <option value="editor">Editor (Upload)</option>
                <option value="admin">Admin (Moderate)</option>
              </select>
            </>
          )}
          <input className="input-field" type="email" placeholder="Email" onChange={e => setForm({...form, email: e.target.value})} required />
          <input className="input-field" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} required />
          <button className="btn-primary" style={{width:'100%', padding:'12px', borderRadius:'8px', marginTop:'1rem'}}>
            {isRegister ? 'Get Started' : 'Sign In'}
          </button>
        </form>
        <p className="text-dim" style={{textAlign:'center', marginTop:'1.5rem', fontSize:'0.9rem', cursor:'pointer'}} onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? 'Already have an account? Login' : 'No account? Register'}
        </p>
      </div>
    </div>
  );
}

// --- DASHBOARD LAYOUT ---
function DashboardLayout() {
  const { user, setUser } = useContext(AuthCtx);
  const [tab, setTab] = useState('feed');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);
    return () => s.disconnect();
  }, []);

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand"><Play size={24}/> PulseGen</div>
        
        <div className="nav-section-title">Main</div>
        <NavItem icon={<LayoutGrid/>} label="Browse" active={tab === 'feed'} onClick={() => setTab('feed')} />
        
        {['admin', 'editor'].includes(user.role) && (
          <>
            <div className="nav-section-title">Studio</div>
            <NavItem icon={<Upload/>} label="Uploads" active={tab === 'upload'} onClick={() => setTab('upload')} />
          </>
        )}
        
        {user.role === 'admin' && (
          <>
            <div className="nav-section-title">System</div>
            <NavItem icon={<Users/>} label="Users" active={tab === 'users'} onClick={() => setTab('users')} />
          </>
        )}

        <div className="user-profile">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <div className="user-info">
            <h4>{user.username}</h4>
            <p>{user.role}</p>
          </div>
          <button className="btn-reset" style={{marginLeft:'auto'}} onClick={() => { localStorage.removeItem('token'); setUser(null); }}>
            <LogOut size={16} className="text-dim"/>
          </button>
        </div>
      </aside>

      {/* CONTENT AREA */}
      <div className="main-content">
        <header className="top-header">
          <div className="search-wrapper">
            <Search className="search-icon"/>
            <input placeholder="Search videos..." />
          </div>
          <div style={{display:'flex', gap:'1rem'}}>
            <button className="btn-reset text-dim"><Bell size={20}/></button>
          </div>
        </header>

        <main className="view-container">
          {tab === 'feed' && <VideoFeed user={user} socket={socket} />}
          {tab === 'upload' && <UploadManager user={user} />}
          {tab === 'users' && <UserList />}
        </main>
      </div>
    </div>
  );
}

const NavItem = ({ icon, label, active, onClick }) => (
  <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
    {icon} <span>{label}</span>
  </div>
);

// --- VIDEO FEED ---
function VideoFeed({ user, socket }) {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const fetchVideos = async () => {
    try {
      const res = await axios.get(`${API}/videos`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
      setVideos(res.data);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    fetchVideos();
    if(socket) {
      socket.on('video-created', fetchVideos);
      socket.on('video-updated', fetchVideos);
      socket.on('video-deleted', fetchVideos);
      socket.on('video-completed', fetchVideos);
    }
    return () => { if(socket) { socket.off('video-created'); socket.off('video-updated'); socket.off('video-deleted'); socket.off('video-completed'); }}
  }, [socket]);

  // Admin/Editor Actions
  const handleStatus = async (id, status) => {
    await axios.patch(`${API}/videos/${id}/status`, { status }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
  };

  const handleDelete = async (id) => {
    if(confirm("Delete this video permanently?")) {
      await axios.delete(`${API}/videos/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
    }
  };

  return (
    <>
      <h1 className="page-title text-gradient">
        {user.role === 'admin' ? 'Admin Dashboard' : user.role === 'editor' ? 'My Channel' : 'Trending Now'}
      </h1>
      
      <div className="grid-layout">
        {videos.length === 0 && <div className="text-dim">No videos found.</div>}
        {videos.map(v => (
          <div key={v._id} className="video-card">
            <div className="card-thumb" onClick={() => (v.status === 'live' || user.role === 'admin' || user.role === 'editor') && setSelectedVideo(v)}>
              {v.thumbnail ? <img src={`http://localhost:3000${v.thumbnail}`} alt="" /> : <div className="flex-center" style={{height:'100%', color:'#333'}}><Clock className="spin"/></div>}
              <span className={`status-badge ${v.status}`}>{v.status}</span>
              {v.status === 'live' && <div className="flex-center" style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', opacity:0, transition:'0.2s'}}><Play fill="#fff" size={40}/></div>}
            </div>
            
            <div className="card-content">
              <h3 className="card-title">{v.title || v.originalName}</h3>
              <div className="card-meta">
                <span>by {v.userId?.username}</span>
                <span>{v.views} views</span>
              </div>
              
              {/* ADMIN APPROVAL CONTROLS */}
              {user.role === 'admin' && (
                <div className="action-row">
                   {/* If Draft -> Show Approve */}
                  {v.status === 'draft' && (
                    <button className="btn-sm btn-primary-outline" onClick={() => handleStatus(v._id, 'live')}>
                      <CheckCircle size={14}/> Approve
                    </button>
                  )}
                  {/* If Live -> Show Reject */}
                   {v.status === 'live' && (
                    <button className="btn-sm btn-danger-outline" onClick={() => handleStatus(v._id, 'rejected')}>
                      <XCircle size={14}/> Reject
                    </button>
                  )}
                  {/* Delete Always Visible for Admin */}
                  <button className="btn-sm btn-danger" style={{marginLeft:'auto'}} onClick={() => handleDelete(v._id)}><Trash2 size={14}/></button>
                </div>
              )}

              {/* EDITOR CONTROLS (Can only delete their own) */}
              {user.role === 'editor' && v.userId._id === user._id && (
                <div className="action-row">
                  <span className="text-dim" style={{fontSize:'0.75rem'}}>{v.status === 'draft' ? 'Waiting Approval' : v.status}</span>
                  <button className="btn-sm btn-danger" style={{marginLeft:'auto'}} onClick={() => handleDelete(v._id)}><Trash2 size={14}/></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedVideo && <VideoModal video={selectedVideo} close={() => setSelectedVideo(null)} user={user} socket={socket} />}
    </>
  );
}

// --- UPLOAD MANAGER ---
function UploadManager() {
  const [uploading, setUploading] = useState(false);
  
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const fd = new FormData();
    fd.append('video', file);
    setUploading(true);
    try {
      await axios.post(`${API}/videos/upload`, fd, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
      alert('Video Uploaded! Sent to Admin for Approval.');
    } catch(e) { alert('Upload Failed'); }
    finally { setUploading(false); }
  };

  return (
    <div className="flex-center" style={{height:'80%'}}>
      <div className="upload-area" onClick={() => document.getElementById('u-input').click()}>
        <input id="u-input" type="file" hidden accept="video/*" onChange={handleFile} />
        <div style={{marginBottom:'1rem', color:'var(--primary)'}}><Upload size={64} className={uploading ? 'spin' : ''} /></div>
        <h3>{uploading ? 'Uploading & Analyzing...' : 'Click to Upload Video'}</h3>
        <p className="text-dim">MP4, WebM • Max 100MB</p>
      </div>
    </div>
  );
}

// --- USER MANAGEMENT (ADMIN) ---
function UserList() {
  const [users, setUsers] = useState([]);
  const fetch = () => axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}).then(res => setUsers(res.data));
  const remove = async (id) => { if(confirm("Remove User?")) { await axios.delete(`${API}/users/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}); fetch(); }};
  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <h1 className="page-title">Team Access</h1>
      <table style={{width:'100%', textAlign:'left', borderCollapse:'collapse'}}>
        <thead>
          <tr style={{borderBottom:'1px solid var(--border)', color:'var(--text-muted)'}}>
            <th style={{padding:'1rem'}}>User</th>
            <th>Role</th>
            <th>Email</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u._id} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'1rem', fontWeight:'bold'}}>{u.username}</td>
              <td><span className={`status-badge`}>{u.role}</span></td>
              <td className="text-dim">{u.email}</td>
              <td><button className="btn-sm btn-danger" onClick={()=>remove(u._id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- VIDEO PLAYER MODAL ---
function VideoModal({ video, close, user, socket }) {
  const [likes, setLikes] = useState(video.likes.length);
  const [dislikes, setDislikes] = useState(video.dislikes.length);
  const [userVote, setUserVote] = useState(null); // 'like' | 'dislike' | null

  useEffect(() => {
    if(video.likes.includes(user._id)) setUserVote('like');
    if(video.dislikes.includes(user._id)) setUserVote('dislike');
    
    // Join Watch Room
    if(socket) socket.emit('join-room', video._id);
  }, [video, socket, user]);

  const handleVote = async (type) => {
    if (type === 'like') {
      if (userVote === 'like') { setLikes(l=>l-1); setUserVote(null); }
      else { setLikes(l=>l+1); if(userVote === 'dislike') setDislikes(d=>d-1); setUserVote('like'); }
    } else {
      if (userVote === 'dislike') { setDislikes(d=>d-1); setUserVote(null); }
      else { setDislikes(d=>d+1); if(userVote === 'like') setLikes(l=>l-1); setUserVote('dislike'); }
    }

    try {
      await axios.patch(`${API}/videos/${video._id}/vote`, { type }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }});
    } catch(e) { console.error("Vote failed"); }
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="player-wrapper">
          <video src={`${API}/stream/${video._id}`} controls autoPlay style={{width:'100%', height:'100%'}} />
        </div>
        <div className="video-details">
          <div className="flex-between">
            <div>
              <div className="flex-center" style={{justifyContent: 'flex-start', gap: '10px'}}>
                 <h2>{video.title || video.originalName}</h2>
                 {video.status === 'draft' && <span className="status-badge draft">Draft Mode</span>}
              </div>
              <p className="text-dim" style={{marginTop:'4px'}}>{video.description || 'No description provided.'}</p>
            </div>
            
            <div className="stats-bar">
              <button className={`vote-btn ${userVote==='like'?'active':''}`} onClick={() => handleVote('like')}>
                <ThumbsUp size={18}/> {likes}
              </button>
              <button className={`vote-btn ${userVote==='dislike'?'active':''}`} onClick={() => handleVote('dislike')}>
                <ThumbsDown size={18}/> {dislikes}
              </button>
            </div>
          </div>
          <button className="btn-reset" style={{position:'absolute', top:'10px', right:'10px', color:'#fff'}} onClick={close}>
            <X size={24}/>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;