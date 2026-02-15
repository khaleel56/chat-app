const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Feature flags
const featureFlags = require('./config/featureFlags');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users
const users = {};

// Socket.io events
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Handle user joining
  socket.on('user-join', (username) => {
    users[socket.id] = username;
    console.log(`${username} joined the chat`);
    
    // Notify all clients about new user
    io.emit('user-joined', {
      username: username,
      message: `${username} joined the chat`,
      userId: socket.id
    });

    // Send updated user list
    io.emit('user-list', Object.values(users));
  });

  // Handle incoming messages
  socket.on('send-message', (data) => {
    const sender = users[socket.id];
    console.log(`Message from ${sender}:`, data.message);

    // Broadcast message to all clients
    io.emit('receive-message', {
      username: sender,
      message: data.message,
      timestamp: new Date().toLocaleTimeString(),
      userId: socket.id
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const username = users[socket.id];
    delete users[socket.id];
    console.log(`${username} left the chat`);

    // Notify all clients
    io.emit('user-left', {
      username: username,
      message: `${username} left the chat`
    });

    // Send updated user list
    io.emit('user-list', Object.values(users));
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('user-typing', {
      username: users[socket.id],
      isTyping: data.isTyping
    });
  });
});


// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Expose flags to the client
app.get('/flags', (req, res) => {
  res.json(featureFlags.getAll());
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
