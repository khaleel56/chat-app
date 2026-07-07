// Simple shortcode -> unicode emoji map (extend as needed)
const EMOJI_MAP = {
  ':smile:': '😄',
  ':grin:': '😁',
  ':laughing:': '😆',
  ':thumbsup:': '👍',
  ':heart:': '❤️',
  ':cry:': '😢'
};

function convertEmojiShortcodes(text) {
  return text.replace(/:[a-z0-9_+-]+:/gi, (m) => EMOJI_MAP[m] || m);
}

// DOM elements
const usernameInput = document.getElementById('usernameInput');
const roomInput = document.getElementById('roomInput');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const messagesContainer = document.getElementById('messagesContainer');
const userList = document.getElementById('userList');
const status = document.getElementById('status');
const typingIndicator = document.getElementById('typingIndicator');
const uploadStatus = document.getElementById('uploadStatus');
const roomLabel = document.getElementById('roomLabel');

const featureFlags = {
  typingIndicator: true
};

const CHUNK_UPLOAD_THRESHOLD = 10 * 1024 * 1024; // 10MB
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const CHUNK_RETRY_LIMIT = 3;

let username = '';
let currentRoom = 'general';
let typingTimeout;
let failedUpload = null; // Store failed upload for retry
let uploadAbort = null; // AbortController for canceling upload

function init() {
  const socket = io(window.location.origin);

  socket.on('connect', () => {
    status.textContent = 'Connected ✓';
    status.classList.remove('disconnected');
    usernameInput.disabled = false;
    roomInput.disabled = false;
  });

  socket.on('disconnect', () => {
    status.textContent = 'Disconnected ✗';
    status.classList.add('disconnected');
    messageInput.disabled = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    fileInput.disabled = true;
  });

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim()) {
      joinChat();
    }
  });

  roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim()) {
      joinChat();
    }
  });

  function joinChat() {
    username = usernameInput.value.trim();
    currentRoom = roomInput.value.trim() || 'general';

    if (username) {
      socket.emit('user-join', {
        username,
        room: currentRoom
      });

      usernameInput.disabled = true;
      roomInput.disabled = true;
      messageInput.disabled = false;
      sendBtn.disabled = false;
      attachBtn.disabled = false;
      fileInput.disabled = false;
      messageInput.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      sendFile(file);
    }
    event.target.value = '';
  });

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('send-message', { message, room: currentRoom });
      messageInput.value = '';
      messageInput.focus();
      if (featureFlags.typingIndicator) socket.emit('typing', { isTyping: false });
    }
  }

  messageInput.addEventListener('input', () => {
    socket.emit('typing', { isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { isTyping: false });
    }, 1000);
  });

  socket.on('joined-room', (data) => {
    currentRoom = data.room;
    roomLabel.textContent = `Room: ${data.room}`;
  });

  socket.on('receive-message', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.userId === socket.id ? 'own' : 'other'}`;
    const timeHtml = `<div class="message-time">${data.timestamp}</div>`;
    const raw = escapeHtml(data.message);
    const withEmoji = convertEmojiShortcodes(raw);
    messageDiv.innerHTML = `
      <div class="message-username">${data.username}</div>
      <div class="message-text">${withEmoji}</div>
      ${timeHtml}
    `;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
  });

  socket.on('receive-file', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.userId === socket.id ? 'own' : 'other'} file-message`;
    const timeHtml = `<div class="message-time">${data.timestamp}</div>`;
    const fileName = escapeHtml(data.fileName);
    const fileLink = `<a href="${data.fileUrl}" target="_blank" rel="noopener noreferrer">📎 ${fileName}</a>`;
    const previewHtml = data.fileType && data.fileType.startsWith('image/')
      ? `<div class="message-text"><a href="${data.fileUrl}" target="_blank" rel="noopener noreferrer"><img class="file-preview" src="${data.fileUrl}" alt="${fileName}"></a></div>`
      : `<div class="message-text">${fileLink}</div>`;

    messageDiv.innerHTML = `
      <div class="message-username">${data.username}</div>
      ${previewHtml}
      ${timeHtml}
    `;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
  });

  socket.on('user-joined', (data) => {
    addSystemMessage(data.message);
    scrollToBottom();
  });

  socket.on('user-left', (data) => {
    addSystemMessage(data.message);
    scrollToBottom();
  });

  socket.on('user-list', (users) => {
    userList.innerHTML = '';
    users.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'user-item';
      li.textContent = user;
      userList.appendChild(li);
    });
  });

  socket.on('user-typing', (data) => {
    if (data.isTyping) {
      typingIndicator.textContent = `${data.username} is typing...`;
      typingIndicator.style.display = 'block';
    } else {
      typingIndicator.style.display = 'none';
    }
  });

  function sendFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      setUploadStatus('File is too large. Max size is 2GB.');
      return;
    }

    if (file.size > CHUNK_UPLOAD_THRESHOLD) {
      return uploadFileInChunks(file);
    }

    return uploadWholeFile(file);
  }

  function uploadWholeFile(file) {
    setUploadStatus('Uploading file...');
    attachBtn.disabled = true;
    fileInput.disabled = true;

    const formData = new FormData();
    formData.append('file', file);

    return fetch('/upload', {
      method: 'POST',
      body: formData
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.fileUrl) {
          throw new Error('Upload returned no file URL');
        }

        socket.emit('send-file', {
          fileName: data.fileName,
          fileType: data.fileType || file.type,
          fileUrl: data.fileUrl
        });

        setUploadStatus(`Uploaded ${file.name}`);
      })
      .catch((error) => {
        console.error('Upload failed:', error);
        setUploadStatus('Upload failed.');
      })
      .finally(() => {
        attachBtn.disabled = false;
        fileInput.disabled = false;
      });
  }

  async function uploadFileInChunks(file, isRetry = false) {
    const fileId = isRetry ? failedUpload.fileId : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    setUploadStatus(`Uploading ${file.name} in ${totalChunks} chunks...`);
    attachBtn.disabled = true;
    fileInput.disabled = true;
    failedUpload = null; // Clear failed upload on new attempt

    // Create new AbortController for this upload
    uploadAbort = new AbortController();

    try {
      // Only query server for already uploaded chunks on retry (resume support)
      let uploadedSet = new Set();
      if (isRetry) {
        try {
          const statusResp = await fetch(`/upload-status?fileId=${encodeURIComponent(fileId)}`, {
            signal: uploadAbort.signal
          });
          if (statusResp.ok) {
            const statusJson = await statusResp.json();
            if (Array.isArray(statusJson.uploaded)) uploadedSet = new Set(statusJson.uploaded);
          }
        } catch (e) {
          // ignore status query errors and proceed from scratch
        }
      }

      let finalResult = null;

      for (let index = 0; index < totalChunks; index++) {
        if (uploadedSet.has(index)) {
          const progress = Math.round(((index + 1) / totalChunks) * 100);
          setUploadStatus(`Uploading ${file.name}: ${progress}% (${index + 1}/${totalChunks})`, progress / 100);
          continue;
        }

        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        let attemptError = null;
        let success = false;
        for (let attempt = 1; attempt <= CHUNK_RETRY_LIMIT; attempt++) {
          const formData = new FormData();
          formData.append('chunk', chunk, file.name);
          formData.append('fileId', fileId);
          formData.append('fileName', file.name);
          formData.append('fileType', file.type);
          formData.append('totalChunks', totalChunks);
          formData.append('chunkIndex', index);

          try {
            const response = await fetch('/upload-chunk', { 
              method: 'POST', 
              body: formData,
              signal: uploadAbort.signal
            });
            if (!response.ok) throw new Error(`Chunk ${index + 1} upload failed with status ${response.status}`);
            finalResult = await response.json();
            success = true;
            break;
          } catch (err) {
            attemptError = err;
            setUploadStatus(`Chunk ${index + 1} failed (attempt ${attempt}/${CHUNK_RETRY_LIMIT})`);
            // brief backoff
            await new Promise((r) => setTimeout(r, 300 * attempt));
          }
        }

        if (!success) {
          throw attemptError || new Error(`Chunk ${index + 1} upload failed`);
        }

        const progress = Math.round(((index + 1) / totalChunks) * 100);
        setUploadStatus(`Uploading ${file.name}: ${progress}% (${index + 1}/${totalChunks})`, progress / 100);
      }

      if (!finalResult?.fileUrl) {
        throw new Error('Chunked upload did not return a final file URL');
      }

      socket.emit('send-file', {
        fileName: finalResult.fileName || file.name,
        fileType: finalResult.fileType || file.type,
        fileUrl: finalResult.fileUrl
      });

      uploadAbort = null; // Clear abort before final status
      setUploadStatus(`Uploaded ${file.name}`);
    } catch (error) {
      console.error('Chunk upload failed:', error);
      // Don't store as failed if user canceled
      if (error.name !== 'AbortError') {
        failedUpload = { file, fileId, totalChunks };
        uploadAbort = null; // Clear abort before error status
        setUploadStatus(`Chunk upload failed. ${error?.message || ''}`.trim(), 'error');
      } else {
        uploadAbort = null; // Clear abort before cancel status
        setUploadStatus('Upload canceled');
      }
    } finally {
      uploadAbort = null;
      attachBtn.disabled = false;
      fileInput.disabled = false;
    }
  }

  function setUploadStatus(message, statusOrProgress = 0) {
    uploadStatus.innerHTML = '';
    uploadStatus.textContent = message;
    
    if (statusOrProgress === 'error' && failedUpload) {
      uploadStatus.style.color = '#d32f2f';
      const retryBtn = document.createElement('button');
      retryBtn.textContent = ' Retry Upload';
      retryBtn.style.marginLeft = '10px';
      retryBtn.style.padding = '5px 10px';
      retryBtn.style.cursor = 'pointer';
      retryBtn.style.backgroundColor = '#d32f2f';
      retryBtn.style.color = 'white';
      retryBtn.style.border = 'none';
      retryBtn.style.borderRadius = '3px';
      retryBtn.onclick = () => {
        uploadFileInChunks(failedUpload.file, true); // Retry with isRetry=true
      };
      uploadStatus.appendChild(retryBtn);
    } else if (uploadAbort && typeof statusOrProgress === 'number') {
      // Show Cancel button during upload
      uploadStatus.style.color = '#333';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = ' Cancel';
      cancelBtn.style.marginLeft = '10px';
      cancelBtn.style.padding = '5px 10px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.style.backgroundColor = '#ff9800';
      cancelBtn.style.color = 'white';
      cancelBtn.style.border = 'none';
      cancelBtn.style.borderRadius = '3px';
      cancelBtn.onclick = () => {
        if (uploadAbort) {
          uploadAbort.abort();
          setUploadStatus('Upload canceled');
        }
      };
      uploadStatus.appendChild(cancelBtn);
    } else {
      const progress = typeof statusOrProgress === 'number' ? statusOrProgress : 0;
      uploadStatus.style.color = progress > 0 && progress <= 1 ? '#333' : '#555';
    }
  }

  function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>\"']/g, (m) => map[m]);
  }
}

init();
