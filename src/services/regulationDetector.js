const { pool } = require('./database');
const nlp = require('./nlpProcessor'); // Natural language processing helper

class RegulationDetector {
    // Somatic language patterns indicating regulation moments
    static SOMATIC_MARKERS = {
        BREATH_PATTERNS: [
            'deep breath', 'exhale', 'breathing', 'sigh', 'inhale',
            'feel my breath', 'breathing slows', 'breath deepens'
        ],
        GROUNDING_PATTERNS: [
            'feel my feet', 'feel grounded', 'present', 'here now',
            'feel my body', 'notice sensation', 'sense into'
        ],
        PRESENCE_MARKERS: [
            'pause', 'notice', 'aware', 'feeling into', 'sense',
            'track', 'observe', 'attention to'
        ]
    };

    // Regulation state indicators
    static REGULATION_STATES = {
        DYSREGULATED: ['overwhelm', 'panic', 'frozen', 'shut down', 'activated'],
        REGULATING: ['calming', 'settling', 'easing', 'releasing', 'softening'],
        REGULATED: ['calm', 'peaceful', 'grounded', 'centered', 'balanced']
    };

    /**
     * Analyze message content for regulation markers
     */
    async detectRegulationMoments(message, conversationId, userId) {
        const regulationMarkers = [];
        
        // Check for breath awareness
        if (this._containsPatterns(message, RegulationDetector.SOMATIC_MARKERS.BREATH_PATTERNS)) {
            regulationMarkers.push({
                type: 'voluntary_exhale',
                confidence: this._calculateConfidence(message, 'breath')
            });
        }

        // Check for presence over pattern
        if (this._containsPatterns(message, RegulationDetector.SOMATIC_MARKERS.PRESENCE_MARKERS)) {
            regulationMarkers.push({
                type: 'presence_over_pattern',
                confidence: this._calculateConfidence(message, 'presence')
            });
        }

        // Check state transitions
        const stateTransition = await this._detectStateTransition(message, userId);
        if (stateTransition) {
            regulationMarkers.push({
                type: 'pfc_regulation',
                confidence: stateTransition.confidence,
                beforeState: stateTransition.before,
                afterState: stateTransition.after
            });
        }

        return regulationMarkers;
    }

    /**
     * Calculate confidence score for regulation detection
     */
    _calculateConfidence(message, markerType) {
        const relevantPatterns = RegulationDetector.SOMATIC_MARKERS[`${markerType.toUpperCase()}_PATTERNS`];
        const matches = relevantPatterns.filter(pattern => 
            message.toLowerCase().includes(pattern.toLowerCase())
        );
        
        return Math.min(matches.length * 0.2, 1); // 0.2 per match, max 1.0
    }

    /**
     * Detect nervous system state transitions
     */
    async _detectStateTransition(message, userId) {
        const recentMessages = await this._getRecentMessages(userId);
        const currentState = this._assessState(message);
        const previousState = this._assessState(recentMessages[0]?.content);

        if (previousState && currentState && previousState !== currentState) {
            return {
                before: previousState,
                after: currentState,
                confidence: 0.8
            };
        }

        return null;
    }

    /**
     * Get user's recent messages for context
     */
    async _getRecentMessages(userId) {
        const result = await pool.query(
            `SELECT content FROM messages 
             WHERE user_id = $1 
             ORDER BY timestamp DESC 
             LIMIT 5`,
            [userId]
        );
        return result.rows;
    }

    /**
     * Assess nervous system state from message content
     */
    _assessState(message) {
        if (!message) return null;

        const text = message.toLowerCase();
        
        for (const [state, patterns] of Object.entries(RegulationDetector.REGULATION_STATES)) {
            if (patterns.some(pattern => text.includes(pattern))) {
                return state.toLowerCase();
            }
        }

        return null;
    }

    /**
     * Check if message contains any patterns
     */
    _containsPatterns(message, patterns) {
        return patterns.some(pattern => 
            message.toLowerCase().includes(pattern.toLowerCase())
        );
    }
}

module.exports = new RegulationDetector();