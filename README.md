# WebSocket Chat Application

A real-time chat application built with Node.js, Express, and Socket.io to demonstrate WebSocket implementation.

## Features

- ✅ Real-time messaging with WebSocket
- ✅ User join/leave notifications
- ✅ Online user list
- ✅ Typing indicator
- ✅ Message timestamps
- ✅ Responsive UI
- ✅ Multiple concurrent users

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Protocol:** WebSocket (Socket.io)
- **Port:** 3000 (default)

## Installation

```bash
# Install dependencies
npm install
```

## Running the Application

```bash
# Start server
npm start

# Or with auto-reload (requires nodemon)
npm run dev
```

The application will be available at: `http://localhost:3000`

## Project Structure

```
ChatApp/
├── server.js              # Main server file
├── package.json           # Project dependencies
├── public/
│   ├── index.html         # Client HTML
│   └── chat.js            # Client JavaScript
└── README.md              # This file
```

## How It Works

### Server-Side (Socket.io Events)

1. **user-join** - User joins the chat
   - Stores username in memory
   - Broadcasts join notification
   - Sends updated user list

2. **send-message** - User sends a message
   - Broadcasts message to all clients
   - Includes username and timestamp

3. **typing** - User typing indicator
   - Broadcasts typing status to other users

4. **disconnect** - User leaves chat
   - Removes user from list
   - Broadcasts leave notification

### Client-Side (WebSocket Handling)

1. **Connect** - Establishes WebSocket connection
2. **Enter Username** - User provides name and joins
3. **Send Messages** - Real-time message broadcasting
4. **Receive Messages** - Updates UI with new messages
5. **Disconnect** - Clean disconnect handling

## WebSocket Features Tested

✅ **Connection Management**
- Client-server connection establishment
- Automatic reconnection on disconnect
- Connection status display

✅ **Real-time Communication**
- Bidirectional messaging
- Event emission and reception
- Broadcasting to multiple clients

✅ **User Management**
- User list synchronization
- Join/leave notifications
- User identification

✅ **Advanced Features**
- Typing indicators
- Message timestamps
- Escape HTML for security

## Usage

1. Open `http://localhost:3000` in multiple browser tabs or windows
2. Enter your name in the username field and press Enter
3. Type a message and click Send or press Enter
4. Messages appear in real-time across all connected clients
5. See "User X is typing..." when other users type
6. User join/leave notifications in the chat

## Testing WebSocket

To test WebSocket connection:

```bash
# Check if server is running
curl http://localhost:3000

# Monitor socket events in browser console
# The chat.js file logs important events
```

## Security Notes

- HTML escaping is implemented to prevent XSS attacks
- Socket.io handles CORS automatically
- Usernames are validated before processing
- Messages are sanitized on the client

## Future Enhancements

- [ ] User authentication
- [ ] Private messaging
- [ ] Message history (database)
- [ ] User avatars
- [ ] Emoji support
- [ ] File sharing
- [ ] Room-based chat
- [ ] Admin controls

## Troubleshooting

**Port already in use:**
```bash
# Change port in server.js
# Or kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Socket.io not connecting:**
- Check browser console for errors
- Verify server is running
- Check CORS settings
- Ensure Socket.io library is loaded

**Messages not appearing:**
- Check if user is properly joined (username set)
- Verify browser console for errors
- Check server logs for message events

## License

ISC
