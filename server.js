require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ffmpeg = require('fluent-ffmpeg');

// --- CRITICAL FIX: Link both FFMPEG and FFPROBE binaries ---
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Explicitly set the paths for the libraries
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'pulse-v7-ultimate-key';

// --- CONFIG ---
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH"] }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// --- DB ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulse-v7')
  .then(() => console.log('⚡ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'viewer' },
  createdAt: { type: Date, default: Date.now }
});

const videoSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  mimetype: String,
  size: Number,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  duration: { type: Number, default: 0 },
  status: { type: String, enum: ['processing', 'draft', 'live', 'rejected'], default: 'processing' },
  sensitivityScore: { type: Number, default: 0 },
  processingProgress: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const User = mongoose.model('User', userSchema);
const Video = mongoose.model('Video', videoSchema);

// --- SOCKET ---
const io = new Server(server, { cors: { origin: "*" } });
io.on('connection', (socket) => {
  socket.on('join-room', (videoId) => socket.join(videoId));
  socket.on('sync-action', ({ videoId, type, time }) => socket.to(videoId).emit('sync-update', { type, time }));
});

// --- MIDDLEWARE ---
const auth = (allowedRoles = []) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Auth Required' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User Missing' });
    if (allowedRoles.length && !allowedRoles.includes(user.role)) return res.status(403).json({ error: 'Access Denied' });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid Token' }); }
};

// --- PROCESSOR ---
async function processVideoReal(videoId, filePath) {
  const video = await Video.findById(videoId);
  if(!video) return;
  const thumbFilename = `thumb-${videoId}.png`;
  
  // Ensure absolute path to prevent lookup issues
  const absolutePath = path.resolve(filePath);

  console.log(`🎬 Starting processing for: ${absolutePath}`);

  ffmpeg(absolutePath)
    .on('start', () => io.emit('video-progress', { videoId, progress: 10 }))
    .on('progress', (p) => {
      if(p.percent) io.emit('video-progress', { videoId, progress: Math.min(Math.floor(p.percent), 90) });
    })
    .screenshots({ 
        count: 1, 
        folder: uploadDir, // Use the absolute variable
        filename: thumbFilename, 
        size: '640x360' 
    })
    .on('end', async () => {
      console.log(`📸 Thumbnail generated. Probing metadata...`);
      
      ffmpeg.ffprobe(absolutePath, async (err, metadata) => {
        if (err) {
            console.error("❌ FFPROBE FAILED:", err);
            video.status = 'rejected';
            await video.save();
            return;
        }

        video.duration = metadata?.format?.duration || 0;
        video.thumbnail = `/uploads/${thumbFilename}`;
        video.processingProgress = 100;
        video.sensitivityScore = Math.floor(Math.random() * 100);
        
        // STATUS: DRAFT (Waiting for Admin)
        video.status = 'draft'; 
        
        video.title = video.originalName.replace(/\.[^/.]+$/, "");
        await video.save();
        io.emit('video-completed', video);
        console.log(`✅ Video ${videoId} ready in DRAFT mode.`);
      });
    })
    .on('error', (err) => {
      console.error("❌ FFMPEG PROCESSING ERROR:", err.message);
      if (err.message.includes('ffmpeg exited with code')) {
         console.error("Tip: Check if the uploaded file is a valid video format.");
      }
      video.status = 'rejected';
      video.save();
      io.emit('video-error', { videoId, error: 'Processing Failed' });
    });
}

// --- ROUTES ---

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ error: "Email exists" });
    const user = await User.create({ username, email, password: await bcrypt.hash(password, 10), role });
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { id: user._id, username, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Invalid Credentials" });
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth(), (req, res) => res.json({ user: req.user }));

// Videos
app.get('/api/videos', auth(), async (req, res) => {
  let query = {};
  
  if (req.user.role === 'viewer') {
    query.status = 'live';
  } else if (req.user.role === 'editor') {
    query.$or = [{ userId: req.user._id }, { status: 'live' }];
  }
  // Admin sees all
  
  const videos = await Video.find(query).populate('userId', 'username').sort({ uploadedAt: -1 });
  res.json(videos);
});

// Vote
app.patch('/api/videos/:id/vote', auth(), async (req, res) => {
  const { type } = req.body;
  const userId = req.user._id;
  const video = await Video.findById(req.params.id);
  
  if (!video) return res.status(404).json({ error: "Video not found" });

  video.likes.pull(userId);
  video.dislikes.pull(userId);

  if (type === 'like') video.likes.push(userId);
  if (type === 'dislike') video.dislikes.push(userId);

  await video.save();
  res.json(video);
});

// Upload
const upload = multer({ dest: 'uploads/' });
app.post('/api/videos/upload', auth(['admin', 'editor']), upload.single('video'), async (req, res) => {
  try {
    const video = await Video.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      userId: req.user._id,
      status: 'processing'
    });
    io.emit('video-created', video);
    
    // Pass absolute path to processor
    processVideoReal(video._id, path.resolve(video.path));
    
    res.json(video);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Status Update (Admin Approval)
app.patch('/api/videos/:id/status', auth(['admin', 'editor']), async (req, res) => {
  const { status } = req.body;
  const query = { _id: req.params.id };
  if(req.user.role === 'editor') query.userId = req.user._id;

  const video = await Video.findOneAndUpdate(query, { status }, { new: true });
  io.emit('video-updated', video);
  res.json(video);
});

// Delete
app.delete('/api/videos/:id', auth(['admin', 'editor']), async (req, res) => {
  const query = { _id: req.params.id };
  if (req.user.role === 'editor') query.userId = req.user._id;
  
  const video = await Video.findOneAndDelete(query);
  if(video) {
    if(fs.existsSync(video.path)) fs.unlinkSync(video.path);
    const thumbPath = path.join(uploadDir, `thumb-${video._id}.png`);
    if(fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
  
  io.emit('video-deleted', req.params.id);
  res.json({ success: true });
});

// Stream
app.get('/api/stream/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).end();
    
    if(!req.headers.range) { 
      video.views++; 
      await video.save(); 
    }

    const videoPath = path.resolve(video.path);
    if(!fs.existsSync(videoPath)) return res.status(404).end();

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunk = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunk, 'Content-Type': video.mimetype });
      file.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': video.mimetype });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

app.get('/api/users', auth(['admin']), async (req, res) => res.json(await User.find()));
app.delete('/api/users/:id', auth(['admin']), async (req, res) => { await User.findByIdAndDelete(req.params.id); res.json({success:true}); });

server.listen(PORT, () => console.log(`🚀 PulseGen Server on ${PORT}`));