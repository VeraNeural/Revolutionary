const { pool } = require('./database');

class RegulationTracker {
    /**
     * Record a new instance of regulation evidence
     */
    async recordEvidence({
        userId,
        evidenceType,
        description,
        context,
        conversationId,
        durationSeconds,
        difficultyLevel,
        triggerIntensity,
        bodyLocation,
        emotionalStateBefore,
        emotionalStateAfter
    }) {
        const result = await pool.query(
            'SELECT record_regulation_evidence($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as evidence_id',
            [
                userId,
                evidenceType,
                description,
                context,
                conversationId,
                durationSeconds,
                difficultyLevel,
                triggerIntensity,
                bodyLocation,
                emotionalStateBefore,
                emotionalStateAfter
            ]
        );
        return result.rows[0].evidence_id;
    }

    /**
     * Analyze regulation progress over time
     */
    async analyzeProgress(userId, startDate = null, endDate = new Date()) {
        const result = await pool.query(
            'SELECT * FROM analyze_regulation_progress($1, $2, $3)',
            [userId, startDate, endDate]
        );
        return result.rows;
    }

    /**
     * Identify patterns in regulation
     */
    async identifyPatterns(userId, days = 30) {
        const result = await pool.query(
            'SELECT * FROM identify_regulation_patterns($1, $2)',
            [userId, days]
        );
        return result.rows;
    }

    /**
     * Track window of tolerance evolution
     */
    async analyzeWindowOfTolerance(userId, weeks = 12) {
        const result = await pool.query(
            'SELECT * FROM analyze_window_of_tolerance($1, $2)',
            [userId, weeks]
        );
        return result.rows;
    }

    /**
     * Get recent breakthroughs
     */
    async getRecentBreakthroughs(userId, limit = 5) {
        const result = await pool.query(
            `SELECT * FROM recent_regulation_breakthroughs 
             WHERE user_id = $1 
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    }
}

module.exports = new RegulationTracker();