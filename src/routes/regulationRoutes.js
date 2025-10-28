const router = require('express').Router();
const regulationTracker = require('../services/regulationTracker');

// Record new regulation evidence
router.post('/evidence', async (req, res) => {
  try {
    const evidenceId = await regulationTracker.recordEvidence(req.body);
    res.json({ success: true, evidenceId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get regulation progress analysis
router.get('/progress/:userId', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const progress = await regulationTracker.analyzeProgress(req.params.userId, startDate, endDate);
    res.json(progress);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get regulation patterns
router.get('/patterns/:userId', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const patterns = await regulationTracker.identifyPatterns(req.params.userId, days);
    res.json(patterns);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get window of tolerance analysis
router.get('/window-of-tolerance/:userId', async (req, res) => {
  try {
    const weeks = req.query.weeks ? parseInt(req.query.weeks) : 12;
    const analysis = await regulationTracker.analyzeWindowOfTolerance(req.params.userId, weeks);
    res.json(analysis);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get recent breakthroughs
router.get('/breakthroughs/:userId', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    const breakthroughs = await regulationTracker.getRecentBreakthroughs(req.params.userId, limit);
    res.json(breakthroughs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
