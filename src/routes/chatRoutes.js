const { trackRegulation } = require('./middleware/regulationTracker');

// Add regulation tracking to chat endpoint
app.post('/api/chat', trackRegulation, async (req, res) => {
  // ... existing chat endpoint code ...
});
