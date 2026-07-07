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

const chunkUploadsDir = path.join(__dirname, 'public', 'uploads', 'chunks');
fs.mkdirSync(chunkUploadsDir, { recursive: true });

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 } // 6MB per chunk
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

app.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
  const { fileId, fileName, fileType, totalChunks, chunkIndex } = req.body;

  if (!req.file || !fileId || !fileName || totalChunks == null || chunkIndex == null) {
    return res.status(400).json({ error: 'Missing chunk upload metadata' });
  }

  const safeFileId = sanitizeFileName(String(fileId)).slice(0, 50);
  const safeName = sanitizeFileName(String(fileName)).slice(0, 80);
  const total = Number(totalChunks);
  const index = Number(chunkIndex);

  if (Number.isNaN(total) || Number.isNaN(index) || total <= 0 || index < 0 || index >= total) {
    return res.status(400).json({ error: 'Invalid chunk metadata' });
  }

  const chunkDir = path.join(chunkUploadsDir, safeFileId);
  fs.mkdirSync(chunkDir, { recursive: true });
  const chunkPath = path.join(chunkDir, `${index}.part`);

  try {
    await fs.promises.writeFile(chunkPath, req.file.buffer);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save chunk' });
  }

  const chunkFiles = await fs.promises.readdir(chunkDir);
  if (chunkFiles.length < total) {
    return res.json({ fileUrl: null });
  }

  const finalFilename = `${Date.now()}-${safeName}`;
  const finalPath = path.join(uploadsDir, finalFilename);
  const writeStream = fs.createWriteStream(finalPath);

  try {
    for (let i = 0; i < total; i++) {
      const partPath = path.join(chunkDir, `${i}.part`);
      if (!fs.existsSync(partPath)) {
        writeStream.close();
        return res.status(400).json({ error: 'Missing chunk part' });
      }
      const chunkBuffer = await fs.promises.readFile(partPath);
      writeStream.write(chunkBuffer);
    }
    writeStream.end();
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    await Promise.all(chunkFiles.map((file) => fs.promises.unlink(path.join(chunkDir, file))));
    await fs.promises.rmdir(chunkDir);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to assemble chunks' });
  }

  res.json({
    fileName: safeName,
    fileType: fileType || 'application/octet-stream',
    fileUrl: `/uploads/${finalFilename}`
  });
});

// Return which chunk parts have already been uploaded for a given fileId
app.get('/upload-status', async (req, res) => {
  const { fileId } = req.query || {};
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const safeFileId = sanitizeFileName(String(fileId)).slice(0, 50);
  const chunkDir = path.join(chunkUploadsDir, safeFileId);

  try {
    if (!fs.existsSync(chunkDir)) return res.json({ uploaded: [] });
    const files = await fs.promises.readdir(chunkDir);
    const uploaded = files
      .filter((f) => f.endsWith('.part'))
      .map((f) => Number.parseInt(f.replace('.part', ''), 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    return res.json({ uploaded });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to read upload status' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
