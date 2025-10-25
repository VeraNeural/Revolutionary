-- VERA Conversations Feature - Database Migration
-- Run this to add conversation tracking to your existing database

-- ==================== CONVERSATIONS TABLE ====================
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  last_message_preview TEXT
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- ==================== UPDATE MESSAGES TABLE ====================
-- Add conversation_id to link messages to conversations
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- ==================== CONVERSATION UPDATE TRIGGER ====================
-- Automatically update conversation metadata when messages are added
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.conversation_id IS NOT NULL THEN
        UPDATE conversations 
        SET 
            updated_at = CURRENT_TIMESTAMP,
            message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.conversation_id),
            last_message_preview = CASE 
                WHEN NEW.role = 'user' THEN LEFT(NEW.content, 100)
                ELSE (SELECT LEFT(content, 100) FROM messages WHERE conversation_id = NEW.conversation_id AND role = 'user' ORDER BY created_at DESC LIMIT 1)
            END
        WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_conversation ON messages;
CREATE TRIGGER trigger_update_conversation 
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- ==================== MIGRATE EXISTING MESSAGES ====================
-- Group existing messages by user_id and create conversations
-- This is safe to run multiple times

DO $$
DECLARE
    user_record RECORD;
    new_conversation_id INTEGER;
BEGIN
    -- For each user with messages but no conversation
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM messages 
        WHERE conversation_id IS NULL
    LOOP
        -- Create a conversation for this user
        INSERT INTO conversations (user_id, title, created_at)
        VALUES (
            user_record.user_id,
            'Conversation from ' || TO_CHAR(MIN(created_at), 'Mon DD, YYYY'),
            MIN(created_at)
        )
        RETURNING id INTO new_conversation_id;
        
        -- Link all their messages to this conversation
        UPDATE messages 
        SET conversation_id = new_conversation_id
        WHERE user_id = user_record.user_id 
        AND conversation_id IS NULL;
        
        -- Update conversation metadata
        UPDATE conversations 
        SET 
            message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = new_conversation_id),
            last_message_preview = (
                SELECT LEFT(content, 100) 
                FROM messages 
                WHERE conversation_id = new_conversation_id 
                AND role = 'user' 
                ORDER BY created_at DESC 
                LIMIT 1
            ),
            updated_at = (
                SELECT MAX(created_at) 
                FROM messages 
                WHERE conversation_id = new_conversation_id
            )
        WHERE id = new_conversation_id;
    END LOOP;
END $$;

-- ==================== VERIFICATION ====================
-- Check migration results
SELECT 
    'Total conversations' as metric,
    COUNT(*) as count
FROM conversations
UNION ALL
SELECT 
    'Messages with conversation_id',
    COUNT(*)
FROM messages
WHERE conversation_id IS NOT NULL
UNION ALL
SELECT 
    'Messages without conversation_id (should be 0)',
    COUNT(*)
FROM messages
WHERE conversation_id IS NULL;
