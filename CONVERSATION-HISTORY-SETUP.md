# Conversation History Setup

## 🎉 What's New

Users can now **save and manage multiple conversation sessions** with VERA! Each conversation is stored separately and can be:

- ✅ Viewed in a beautiful history list
- ✅ Loaded back into the chat at any time
- ✅ Deleted when no longer needed
- ✅ Automatically organized by date

## 📊 Database Migration Required

**IMPORTANT:** You need to run the database migration to add the conversations feature.

### Option 1: Railway Dashboard (Recommended)

1. Go to your Railway project dashboard
2. Click on your **PostgreSQL** service
3. Click the **Query** tab
4. Copy the entire contents of `database-conversations.sql`
5. Paste into the query editor
6. Click **Run Query**
7. Check the output - you should see a table showing:
   - Total conversations created
   - Messages linked to conversations
   - Messages without conversation_id (should be 0)

### Option 2: Command Line (If you have psql)

```bash
# Connect to your Railway PostgreSQL database
psql "postgresql://your-connection-string-here"

# Run the migration
\i database-conversations.sql

# Verify
SELECT COUNT(*) FROM conversations;
```

### Option 3: Copy-Paste Individual Queries

If the full script doesn't work, run these queries one at a time:

1. **Create conversations table:**

```sql
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
```

2. **Update messages table:**

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
```

3. **Create trigger function:**

```sql
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
```

4. **Create trigger:**

```sql
DROP TRIGGER IF EXISTS trigger_update_conversation ON messages;
CREATE TRIGGER trigger_update_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
```

5. **Migrate existing messages:**

```sql
DO $$
DECLARE
    user_record RECORD;
    new_conversation_id INTEGER;
BEGIN
    FOR user_record IN
        SELECT DISTINCT user_id
        FROM messages
        WHERE conversation_id IS NULL
    LOOP
        INSERT INTO conversations (user_id, title, created_at)
        SELECT
            user_record.user_id,
            'Conversation from ' || TO_CHAR(MIN(created_at), 'Mon DD, YYYY'),
            MIN(created_at)
        FROM messages
        WHERE user_id = user_record.user_id
        RETURNING id INTO new_conversation_id;

        UPDATE messages
        SET conversation_id = new_conversation_id
        WHERE user_id = user_record.user_id
        AND conversation_id IS NULL;

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
```

## ✅ Verification

After running the migration, verify everything worked:

```sql
-- Check conversations were created
SELECT COUNT(*) as total_conversations FROM conversations;

-- Check messages are linked
SELECT COUNT(*) as linked_messages FROM messages WHERE conversation_id IS NOT NULL;

-- Check for orphaned messages (should be 0)
SELECT COUNT(*) as orphaned_messages FROM messages WHERE conversation_id IS NULL;

-- View sample conversations
SELECT
    id,
    user_id,
    title,
    message_count,
    created_at
FROM conversations
ORDER BY created_at DESC
LIMIT 5;
```

## 🚀 How It Works

### Automatic Behavior

- **First message in 24 hours:** Creates a new conversation
- **Subsequent messages:** Adds to the active conversation
- **New Chat button:** Starts a fresh conversation
- **Loading history:** Continues that specific conversation

### User Experience

1. Users chat normally with VERA
2. All messages are automatically saved to conversations
3. Click **💬 Conversation History** in the menu
4. See all past conversations with:
   - Conversation title
   - Date/time
   - Message count
   - Preview of last user message
5. Click **Load** to continue that conversation
6. Click **Delete** to remove a conversation

### Technical Details

- Conversations auto-create on first message within 24hr window
- Messages link to conversations via `conversation_id` foreign key
- Database triggers keep conversation metadata updated
- Cascade delete: deleting a conversation removes all its messages
- Works for both authenticated users and anonymous sessions

## 🎨 UI Features

- Beautiful modal with gradient cards
- Smooth animations
- Real-time message counts
- Smart date formatting
- Mobile responsive
- Accessible keyboard navigation

## 🔧 Troubleshooting

**"Migration failed"**

- Make sure you're connected to the right database
- Try running queries individually (see Option 3 above)
- Check Railway logs for specific errors

**"No conversations showing"**

- Migration may not have run successfully
- Check if `conversations` table exists: `\dt` or `SELECT * FROM conversations LIMIT 1;`
- Verify existing messages were migrated

**"Can't delete conversations"**

- Check foreign key constraints are in place
- Ensure cascade delete is set: `ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey; ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;`

## 📝 Notes

- Safe to run migration multiple times (uses `IF NOT EXISTS`)
- Existing messages will be grouped into conversations automatically
- Each user/anonId gets their own conversation namespace
- Conversations older than 24 hours are preserved but not auto-continued

---

Need help? Check the Railway logs or database query results for detailed error messages.
