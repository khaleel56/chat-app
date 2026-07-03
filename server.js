const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

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
    const fileData = String(data?.fileData || '');
    const fileType = String(data?.fileType || 'application/octet-stream');

    if (!user || !fileName || !fileData) return;

    const safeFileName = `${Date.now()}-${sanitizeFileName(fileName)}`;
    const filePath = path.join(uploadsDir, safeFileName);
    const buffer = Buffer.from(fileData, 'base64');

    fs.writeFileSync(filePath, buffer);

    io.to(user.room).emit('receive-file', {
      username: user.username,
      fileName,
      fileUrl: `/uploads/${safeFileName}`,
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
