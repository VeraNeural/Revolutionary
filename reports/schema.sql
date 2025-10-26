-- Schema for VERA's reporting system

-- Pattern Detections
CREATE TABLE IF NOT EXISTS pattern_detections (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Consciousness States
CREATE TABLE IF NOT EXISTS consciousness_states (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    processing_time INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Adaptive Code Detections
CREATE TABLE IF NOT EXISTS adaptive_code_detections (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    adaptive_code VARCHAR(100) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pattern_detections_user_id ON pattern_detections(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_detections_detected_at ON pattern_detections(detected_at);
CREATE INDEX IF NOT EXISTS idx_consciousness_states_user_id ON consciousness_states(user_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_states_timestamp ON consciousness_states(timestamp);
CREATE INDEX IF NOT EXISTS idx_adaptive_codes_user_id ON adaptive_code_detections(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_codes_detected_at ON adaptive_code_detections(detected_at);

-- Views for common report queries
CREATE OR REPLACE VIEW pattern_frequency_daily AS
SELECT 
    pattern_type,
    DATE_TRUNC('day', detected_at) as date,
    COUNT(*) as frequency
FROM pattern_detections
GROUP BY pattern_type, DATE_TRUNC('day', detected_at);

CREATE OR REPLACE VIEW consciousness_state_summary AS
SELECT 
    state,
    COUNT(*) as frequency,
    AVG(processing_time) as avg_processing_time
FROM consciousness_states
GROUP BY state;

CREATE OR REPLACE VIEW adaptive_code_summary AS
SELECT 
    adaptive_code,
    COUNT(*) as frequency,
    COUNT(DISTINCT user_id) as unique_users
FROM adaptive_code_detections
GROUP BY adaptive_code;