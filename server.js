const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users with their room
const users = {};
const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const safeName = sanitizeFileName(file.originalname);
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit
});

function getUsersInRoom(roomName) {
  return Object.values(users)
    .filter((user) => user.room === roomName)
    .map((user) => user.username);
}

function sanitizeFileName(fileName) {
  return String(fileName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

// Socket.io events
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('user-join', (payload) => {
    const username = String(payload?.username || '').trim();
    const room = String(payload?.room || 'general').trim() || 'general';

    if (!username) return;

    const previousUser = users[socket.id];
    if (previousUser && previousUser.room && previousUser.room !== room) {
      socket.leave(previousUser.room);
    }

    users[socket.id] = { username, room };
    socket.join(room);

    console.log(`${username} joined room "${room}"`);

    socket.emit('joined-room', { username, room });

    io.to(room).emit('user-joined', {
      username,
      message: `${username} joined the chat`,
      userId: socket.id,
      room
    });

    io.to(room).emit('user-list', getUsersInRoom(room));
  });

  socket.on('send-message', (data) => {
    const user = users[socket.id];
    const message = String(data?.message || '').trim();

    if (!user || !message) return;

    console.log(`Message from ${user.username} in ${user.room}:`, message);

    io.to(user.room).emit('receive-message', {
      username: user.username,
      message,
      timestamp: new Date().toLocaleTimeString(),
      userId: socket.id,
      room: user.room
    });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (!user) return;

    delete users[socket.id];
    console.log(`${user.username} left room "${user.room}"`);

    io.to(user.room).emit('user-left', {
      username: user.username,
      message: `${user.username} left the chat`
    });

    io.to(user.room).emit('user-list', getUsersInRoom(user.room));
  });

  socket.on('typing', (data) => {
    const user = users[socket.id];
    if (!user) return;

    socket.to(user.room).emit('user-typing', {
      username: user.username,
      isTyping: Boolean(data?.isTyping)
    });
  });

  socket.on('send-file', (data) => {
    const user = users[socket.id];
    const fileName = String(data?.fileName || 'file').trim();
    const fileUrl = String(data?.fileUrl || '').trim();
    const fileType = String(data?.fileType || 'application/octet-stream');

    if (!user || !fileName || !fileUrl) return;

    io.to(user.room).emit('receive-file', {
      username: user.username,
      fileName,
      fileUrl,
      fileType,
      timestamp: new Date().toLocaleTimeString(),
      userId: socket.id,
      room: user.room
    });
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    fileName: req.file.originalname,
    fileUrl: `/uploads/${req.file.filename}`,
    fileType: req.file.mimetype
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
