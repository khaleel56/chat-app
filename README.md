# WebSocket Chat Application

A real-time chat application built with Node.js, Express, and Socket.io with **advanced file sharing** capabilities including chunked uploads, automatic retry, and resume functionality.

## Features

### Messaging & Chat
- ✅ Real-time messaging with WebSocket
- ✅ User join/leave notifications
- ✅ Online user list
- ✅ Typing indicator
- ✅ Message timestamps
- ✅ Emoji shortcode support (`:smile:`, `:heart:`, etc.)
- ✅ Multiple concurrent users & room support

### File Sharing (Advanced)
- ✅ **Chunked Upload** - Files split into 4MB chunks for large file support (up to 2GB)
- ✅ **Automatic Retry** - Individual chunks retry up to 3 times with exponential backoff (300ms, 600ms, 900ms)
- ✅ **Smart Resume** - Resume interrupted uploads without re-uploading completed chunks
- ✅ **Upload Cancellation** - Cancel in-progress uploads with visual feedback
- ✅ **Progress Tracking** - Real-time upload progress display (percentage & chunk count)
- ✅ **File Preview** - Image files show thumbnails; other files show download links
- ✅ **Error Recovery** - Failed uploads show "Retry Upload" button for easy resumption

## Tech Stack

- **Backend:** Node.js, Express, Socket.io, Multer
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+)
- **Protocol:** WebSocket (Socket.io)
- **File Storage:** Local filesystem
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
├── server.js              # Main server (Express + Socket.io)
├── package.json           # Project dependencies
├── public/
│   ├── index.html         # Client HTML
│   ├── chat.js            # Client JavaScript with upload logic
│   └── uploads/           # Uploaded files storage
│       └── chunks/        # Temporary chunk storage (cleanup after assembly)
├── config/
│   └── featureFlags.js    # Feature configuration
└── README.md              # This file
```

## How It Works

### Server-Side Architecture

#### Socket.io Events (Real-time Communication)

1. **user-join** - User joins the chat
   - Stores username and room in memory
   - Broadcasts join notification
   - Sends updated user list to room

2. **send-message** - User sends a message
   - Validates user exists
   - Broadcasts message to room with username, content, timestamp
   - Includes user socket ID for styling (own vs other)

3. **send-file** - User shares a file
   - Receives file metadata and URL
   - Broadcasts file message to room
   - Includes file type for preview rendering

4. **typing** - User typing indicator
   - Broadcasts typing status to other users in room
   - Only sent if feature flag enabled

5. **disconnect** - User leaves chat
   - Removes user from list
   - Broadcasts leave notification
   - Cleans up user data

#### HTTP Routes (File Upload)

1. **POST /upload** - Single file upload
   - For files < 10MB
   - Uses Multer single file middleware
   - Returns: `{ fileName, fileUrl, fileType }`

2. **POST /upload-chunk** - Chunked upload endpoint
   - For large files split into 4MB chunks
   - Receives: `fileId, fileName, fileType, totalChunks, chunkIndex, chunk (binary)`
   - Saves chunk to: `public/uploads/chunks/{fileId}/{chunkIndex}.part`
   - When all chunks received:
     - Assembles chunks in order
     - Writes final file to: `public/uploads/{timestamp}-{filename}`
     - Cleans up temporary chunk files
   - Returns: `{ fileUrl: null }` while assembling, `{ fileName, fileUrl, fileType }` when complete

3. **GET /upload-status** - Query chunk upload status
   - Called before retry to check which chunks already exist
   - Receives: `?fileId={fileId}`
   - Returns: `{ uploaded: [0, 1, 2] }` (array of already-uploaded chunk indices)
   - Used only on retry/resume (not on first upload)

### Client-Side Architecture

#### Upload Flow

**Small Files (<10MB):**
```
Select file → uploadWholeFile()
  ↓
POST /upload
  ↓
Success → emit send-file event → display in chat
Error → show "Upload failed" button
```

**Large Files (>10MB):**
```
Select file → uploadFileInChunks()
  ↓
Chunk file into 4MB pieces
  ↓
For each chunk (first attempt only):
  POST /upload-chunk
  ↓
On failure:
  Retry up to 3 times with backoff
  ↓
If all retries fail:
  Store failed upload info
  Show "Retry Upload" button
```

#### Retry/Resume Mechanism

**On Retry:**
```
User clicks "Retry Upload"
  ↓
GET /upload-status?fileId={same-id}
  ↓
Server returns: [0, 1, 2] (chunks already uploaded)
  ↓
Client skips chunks 0-2
  ↓
Only re-upload chunk 3 (the failed one)
  ↓
When all chunks present on server:
  Server assembles → returns final URL
  ↓
Success!
```

#### Chunk Retry Logic

Each chunk automatically retries **3 times** if it fails:
- **Attempt 1:** Fails → Wait 300ms
- **Attempt 2:** Fails → Wait 600ms  
- **Attempt 3:** Fails → Wait 900ms
- **All failed:** Stop & show "Retry Upload" button

Only **that specific chunk** is retried; other chunks are not affected.

### Key Features Explained

#### 1. Chunked Upload
- **Threshold:** 10MB - files above this use chunking
- **Chunk Size:** 4MB per chunk
- **Max File Size:** 2GB total
- **Benefit:** Handle large files without timeout; resume capability

#### 2. Automatic Retry
```javascript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    fetch('/upload-chunk', { signal: uploadAbort.signal });
    // Success → break
  } catch (err) {
    // Wait 300ms * attempt, then retry
  }
}
```

#### 3. Smart Resume
- Only calls `/upload-status` **on retry** (not on first upload)
- Saves bandwidth on successful first attempts
- Reuses same `fileId` so server recognizes resumed upload
- Skips already-uploaded chunks automatically

#### 4. Upload Cancellation
- **AbortController API** - Stops fetch requests immediately
- Shows **Cancel button** during upload
- Preserves uploaded chunks on server
- User can retry later to resume

#### 5. Progress Display
```
Uploading file.zip: 75% (3/4) [Cancel]
  └─ Real-time progress with chunk count
```

## Usage Examples

### Sharing a Small File
1. Click **Attach** button
2. Select file (< 10MB)
3. File uploads in single request
4. Appears in chat with download link

### Sharing a Large File
1. Click **Attach** button
2. Select file (> 10MB, e.g., 100MB video)
3. Upload starts → Shows progress
4. Shows chunk count: "Uploading video.mp4: 50% (2/4)"
5. Cancel button available during upload
6. On completion → File appears in chat

### Recovering from Failure
1. Upload starts → Chunk 3 fails after 3 retries
2. **"Retry Upload" button appears** (red)
3. Click Retry
4. System checks `/upload-status` → finds chunks [0,1,2] already uploaded
5. Only re-uploads chunk 3 (the failed one)
6. File completes and appears in chat

### Canceling an Upload
1. During upload → Click **Cancel** button (orange)
2. Chunks 0-2 saved on server
3. Message shows "Upload canceled"
4. Chunks not deleted (can retry later)
5. Click Attach again → Retry button appears
6. Click Retry → Resume from chunk 3

## API Reference

### WebSocket Events

**Client → Server:**
- `user-join` - Join chat with username & room
- `send-message` - Send message text
- `send-file` - Send file metadata after upload
- `typing` - Broadcast typing status

**Server → Client:**
- `joined-room` - Confirm room join
- `user-joined` - Another user joined
- `user-left` - Another user left
- `receive-message` - New message received
- `receive-file` - New file shared
- `user-list` - Updated online user list
- `user-typing` - User typing status

### HTTP Endpoints

**POST /upload**
- Single file upload (< 10MB)
- Response: `{ fileName, fileUrl, fileType }`

**POST /upload-chunk**
- Chunked upload for large files
- Body: `{ chunk, fileId, fileName, fileType, totalChunks, chunkIndex }`
- Response: `{ fileUrl }` or `{ fileUrl: null }` if still assembling

**GET /upload-status**
- Check which chunks uploaded
- Query: `?fileId={fileId}`
- Response: `{ uploaded: [0, 1, 2] }`

## Configuration

### Upload Settings (in `chat.js`)
```javascript
const CHUNK_UPLOAD_THRESHOLD = 10 * 1024 * 1024;  // 10MB
const CHUNK_SIZE = 4 * 1024 * 1024;               // 4MB
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;     // 2GB
const CHUNK_RETRY_LIMIT = 3;                       // 3 retries
```

### Server Settings (in `server.js`)
```javascript
// Multer single file (whole upload)
limits: { fileSize: 10 * 1024 * 1024 * 1024 }  // 10GB limit

// Multer chunked upload
limits: { fileSize: 6 * 1024 * 1024 }           // 6MB per chunk
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| **Network timeout** | Retry chunk up to 3 times with backoff |
| **Server error (500)** | Chunk fails → Show retry button |
| **File too large** | Show "File is too large" error |
| **Disk full** | Server returns 500 → Retry available |
| **User cancels** | Abort signal stops fetch → "Upload canceled" |
| **Browser refresh** | Chunks on server preserved → Can retry |

## WebSocket Features Tested

✅ **Connection Management**
- Client-server connection establishment
- Automatic reconnection on disconnect
- Connection status display with visual indicator

✅ **Real-time Communication**
- Bidirectional messaging with Sub-second latency
- Event emission and reception
- Broadcasting to multiple clients in rooms
- File metadata broadcasting

✅ **User Management**
- User list synchronization across clients
- Join/leave notifications
- Per-room user isolation
- User identification via socket ID

✅ **Advanced Features**
- Typing indicators
- Message timestamps
- Emoji shortcode support
- File sharing with metadata

✅ **File Transfer**
- Chunked uploads for large files
- Individual chunk retry logic
- Resume from failure
- Cancel in-progress uploads
- Progress tracking

## Performance Considerations

1. **Chunk Size (4MB)** - Balanced between:
   - Memory usage (too large = memory spike)
   - Network overhead (too small = many requests)
   - Browser performance

2. **Retry Backoff** - Prevents server overload:
   - Wait: 300ms, 600ms, 900ms
   - Total max wait per chunk: 1.8 seconds

3. **Resume Optimization** - `/upload-status` only called on retry:
   - Saves bandwidth on successful uploads
   - Network overhead: ~0.1 second per retry

4. **Cleanup** - Chunk files deleted after assembly:
   - Prevents disk space buildup
   - Keeps uploads directory clean

## Troubleshooting

### Upload stuck at 0%
- Check browser network tab for failures
- Verify server is running: `npm start`
- Check `public/uploads/chunks/` permissions

### "Upload canceled" without clicking Cancel
- Network disconnection occurred
- Server timeout (check Node.js logs)
- Browser crashed (partial chunks saved, can retry)

### File appears but empty
- Server assembling failed (check `/uploads/chunks/` exist)
- Insufficient disk space
- Check server logs for errors

### Cannot resume upload
- Browser session lost (socket disconnected)
- Different fileId (chunks from old ID won't match)
- Upload timeout > 1 hour (chunks auto-cleaned)

## Future Enhancements

- 🔄 Background upload queue with persistence
- 📊 Upload statistics (speed, time remaining)
- 🎯 Pause upload (not just cancel)
- 🔐 End-to-end encryption for files
- 📁 Folder upload support
- 💾 Automatic file cleanup (TTL on chunks)
- 🖼️ More file preview types (video, audio, PDF)

## License

MIT
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
