// Simple feature flag module. Flags can be controlled via environment variables:
// FEAT_TYPING=true|false  - enable typing indicator (default: true)
// FEAT_MSG_TS=true|false  - show message timestamps (default: true)
// FEAT_EMOJI=true|false   - enable emoji support (default: false)

const flags = {
  typingIndicator: process.env.FEAT_TYPING ? process.env.FEAT_TYPING === 'true' : true,
  messageTimestamps: process.env.FEAT_MSG_TS ? process.env.FEAT_MSG_TS === 'true' : true,
  emojiSupport: process.env.FEAT_EMOJI ? process.env.FEAT_EMOJI === 'true' : true,
};

module.exports = {
  isEnabled: (name) => !!flags[name],
  getAll: () => ({ ...flags }),
};
