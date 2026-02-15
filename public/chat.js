// Feature flags fetched from server will control client-side behaviors
let featureFlags = {};

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
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const userList = document.getElementById('userList');
const status = document.getElementById('status');
const typingIndicator = document.getElementById('typingIndicator');

let username = '';
let typingTimeout;

function init() {
  const socket = io(window.location.origin);

  // Connection events
  socket.on('connect', () => {
    status.textContent = 'Connected ✓';
    status.classList.remove('disconnected');
    usernameInput.disabled = false;
  });

  socket.on('disconnect', () => {
    status.textContent = 'Disconnected ✗';
    status.classList.add('disconnected');
    messageInput.disabled = true;
    sendBtn.disabled = true;
  });

  // Join chat
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim()) {
      joinChat();
    }
  });

  function joinChat() {
    username = usernameInput.value.trim();
    if (username) {
      socket.emit('user-join', username);
      usernameInput.disabled = true;
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    }
  }

  // Send message
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('send-message', { message });
      messageInput.value = '';
      messageInput.focus();
      if (featureFlags.typingIndicator) socket.emit('typing', { isTyping: false });
    }
  }

  // Typing indicator (only if enabled)
  if (featureFlags.typingIndicator) {
    messageInput.addEventListener('input', () => {
      socket.emit('typing', { isTyping: true });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('typing', { isTyping: false });
      }, 1000);
    });
  }

  // Receive message
  socket.on('receive-message', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.userId === socket.id ? 'own' : 'other'}`;
    const timeHtml = featureFlags.messageTimestamps ? `<div class="message-time">${data.timestamp}</div>` : '';
    const raw = escapeHtml(data.message);
    const withEmoji = featureFlags.emojiSupport ? convertEmojiShortcodes(raw) : raw;
    messageDiv.innerHTML = `
      <div class="message-username">${data.username}</div>
      <div class="message-text">${withEmoji}</div>
      ${timeHtml}
    `;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
  });

  // User joined
  socket.on('user-joined', (data) => {
    addSystemMessage(data.message);
    scrollToBottom();
  });

  // User left
  socket.on('user-left', (data) => {
    addSystemMessage(data.message);
    scrollToBottom();
  });

  // Update user list
  socket.on('user-list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
      const li = document.createElement('li');
      li.className = 'user-item';
      li.textContent = user;
      userList.appendChild(li);
    });
  });

  // Typing indicator
  if (featureFlags.typingIndicator) {
    socket.on('user-typing', (data) => {
      if (data.isTyping) {
        typingIndicator.textContent = `${data.username} is typing...`;
        typingIndicator.style.display = 'block';
      } else {
        typingIndicator.style.display = 'none';
      }
    });
  } else {
    typingIndicator.style.display = 'none';
  }

  // Utility functions
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
    return text.replace(/[&<>\"']/g, m => map[m]);
  }
}

// Fetch flags from server then initialize client
fetch('/flags')
  .then(res => res.json())
  .then(flags => {
    featureFlags = flags || {};
    init();
  })
  .catch(() => {
    // On error, use defaults and still init
    featureFlags = { typingIndicator: true, messageTimestamps: true, emojiSupport: false };
    init();
  });
