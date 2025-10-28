const pool = require('../database');

async function trackRegulation(req, res, next) {
  const originalSend = res.send;

  res.send = async function (data) {
    try {
      // Only process user messages
      if (data && data.role === 'user') {
        const message = data.content;
        const userId = req.session.userId;
        const conversationId = req.params.conversationId;

        // Simple somatic markers detection
        const somaticMarkers = [
          'breath',
          'exhale',
          'ground',
          'present',
          'feel',
          'notice',
          'sense',
          'body',
          'calm',
          'settle',
          'release',
        ];

        // Check for somatic awareness
        const foundMarkers = somaticMarkers.filter((marker) =>
          message.toLowerCase().includes(marker)
        );

        if (foundMarkers.length > 0) {
          // Record regulation moment
          await pool.query(
            `INSERT INTO regulation_evidence 
                        (user_id, evidence_type, description, context, conversation_id) 
                        VALUES ($1, $2, $3, $4, $5)`,
            [
              userId,
              'somatic_awareness',
              message,
              `Found markers: ${foundMarkers.join(', ')}`,
              conversationId,
            ]
          );
        }
      }

      originalSend.apply(res, arguments);
    } catch (error) {
      console.error('Error in regulation tracking:', error);
      originalSend.apply(res, arguments);
    }
  };

  next();
}

module.exports = { trackRegulation };
