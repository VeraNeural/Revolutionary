const regulationDetector = require('../services/regulationDetector');
const regulationTracker = require('../services/regulationTracker');

class ConversationRegulationMiddleware {
  /**
   * Middleware to detect and track regulation moments in conversations
   */
  async trackRegulation(req, res, next) {
    const originalSend = res.send;

    res.send = async function (data) {
      try {
        // Only process user messages
        if (data && data.role === 'user') {
          const message = data.content;
          const userId = req.session.userId;
          const conversationId = req.params.conversationId;

          // Detect regulation moments
          const regulationMoments = await regulationDetector.detectRegulationMoments(
            message,
            conversationId,
            userId
          );

          // Record detected moments
          for (const moment of regulationMoments) {
            await regulationTracker.recordEvidence({
              userId,
              evidenceType: moment.type,
              description: message,
              context: 'During conversation',
              conversationId,
              // Type-specific fields
              ...(moment.type === 'pfc_regulation' && {
                emotionalStateBefore: moment.beforeState,
                emotionalStateAfter: moment.afterState,
                triggerIntensity: 7, // Default value, can be refined
              }),
              ...(moment.type === 'voluntary_exhale' && {
                durationSeconds: 5, // Default value, can be refined
              }),
              ...(moment.type === 'presence_over_pattern' && {
                difficultyLevel: 6, // Default value, can be refined
              }),
            });
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

  /**
   * Middleware to enrich responses with regulation insights
   */
  async enrichWithRegulationInsights(req, res, next) {
    const originalSend = res.send;

    res.send = async function (data) {
      try {
        if (data && data.role === 'assistant') {
          const userId = req.session.userId;

          // Get recent regulation patterns
          const patterns = await regulationTracker.identifyPatterns(userId, 7); // Last week

          // Get window of tolerance status
          const windowAnalysis = await regulationTracker.analyzeWindowOfTolerance(userId, 1); // Last week

          // Enrich response with regulation insights
          data.regulationInsights = {
            patterns,
            windowOfTolerance: windowAnalysis[0],
          };
        }

        originalSend.apply(res, arguments);
      } catch (error) {
        console.error('Error enriching with regulation insights:', error);
        originalSend.apply(res, arguments);
      }
    };

    next();
  }
}

module.exports = new ConversationRegulationMiddleware();
