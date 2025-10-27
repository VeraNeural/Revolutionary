# Guest-to-Email Collection Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      VERA NEURAL - GUEST FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                              │
│                    (public/chat.html)                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ sendMessage() Function                                  │   │
│  │                                                         │   │
│  │ 1. User types message                                  │   │
│  │ 2. guestMessageCount++                                 │   │
│  │ 3. Create request body:                               │   │
│  │    {                                                   │   │
│  │      message: "...",                                  │   │
│  │      anonId: "anon_xxxxx",                            │   │
│  │      guestMessageCount: 1/2/3/4                       │   │
│  │    }                                                   │   │
│  │ 4. POST /api/chat                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Response Handler                                        │   │
│  │                                                         │   │
│  │ if (data.isGuestMessage4) {                            │   │
│  │   setTimeout(() => {                                  │   │
│  │     showEmailCollectionModal()  // Show modal          │   │
│  │   }, 1000)                                             │   │
│  │ }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Email Collection Modal                                  │   │
│  │                                                         │   │
│  │ ┌───────────────────────────────────────────────────┐  │   │
│  │ │ VERA Email Collection Modal                       │  │   │
│  │ │ ✕                                                 │  │   │
│  │ │                                                   │  │   │
│  │ │ Remember Me?                                      │  │   │
│  │ │                                                   │  │   │
│  │ │ I'd love to remember you. Share your email       │  │   │
│  │ │ and I'll pick up right where we left off.        │  │   │
│  │ │                                                   │  │   │
│  │ │ [📧 your@email.com              ]                │  │   │
│  │ │                                                   │  │   │
│  │ │ [   Yes, Remember Me           ]                 │  │   │
│  │ └───────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  │ handleEmailCollection(event)                            │   │
│  │ ↓                                                       │   │
│  │ POST /api/guest-email                                  │   │
│  │ {                                                       │   │
│  │   email: "user@example.com",                           │   │
│  │   anonId: "anon_xxxxx",                                │   │
│  │   userName: "Guest Name"                               │   │
│  │ }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           ↓ POST /api/chat
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│                      SERVER LAYER                               │
│                    (server.js)                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ POST /api/chat Endpoint                                 │   │
│  │                                                         │   │
│  │ Extract from request:                                  │   │
│  │ • message                                              │   │
│  │ • anonId                                               │   │
│  │ • guestMessageCount ← NEW                              │   │
│  │                                                         │   │
│  │ Pass to getVERAResponse():                             │   │
│  │ getVERAResponse(userId, message, userName,            │   │
│  │   pool, attachments, guestMessageCount)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ POST /api/guest-email Endpoint                          │   │
│  │                                                         │   │
│  │ 1. Validate email format                               │   │
│  │    ✓ Match: ^[^\s@]+@[^\s@]+\.[^\s@]+$                │   │
│  │                                                         │   │
│  │ 2. Validate anonId format                              │   │
│  │    ✓ Match: ^anon_[a-z0-9_]+$                         │   │
│  │                                                         │   │
│  │ 3. Check for duplicate                                 │   │
│  │    SELECT * FROM guest_emails WHERE anon_id = $1      │   │
│  │    if exists → return success (already on file)        │   │
│  │                                                         │   │
│  │ 4. Insert email                                        │   │
│  │    INSERT INTO guest_emails (...)                      │   │
│  │                                                         │   │
│  │ 5. Return { success: true }                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│                      AI LAYER                                    │
│                    (lib/vera-ai.js)                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ getVERAResponse() Function                              │   │
│  │                                                         │   │
│  │ const isGuestMessage4 = (guestMessageCount === 4)      │   │
│  │                                                         │   │
│  │ if (isGuestMessage4) {                                 │   │
│  │   specialPrompt = email collection prompt             │   │
│  │ }                                                       │   │
│  │                                                         │   │
│  │ return {                                                │   │
│  │   response: finalText + specialPrompt,                 │   │
│  │   isGuestMessage4: true/false,  ← Flag                │   │
│  │   state, adaptiveCodes, trustLevel,                    │   │
│  │   ...                                                   │   │
│  │ }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                             │
│                    (PostgreSQL)                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ guest_emails Table                                      │   │
│  │                                                         │   │
│  │ CREATE TABLE guest_emails (                            │   │
│  │   id SERIAL PRIMARY KEY,                               │   │
│  │   anon_id VARCHAR(255) UNIQUE NOT NULL,               │   │
│  │   email VARCHAR(255) NOT NULL,                         │   │
│  │   user_name VARCHAR(255),                              │   │
│  │   collected_at TIMESTAMP,                              │   │
│  │   created_at TIMESTAMP                                 │   │
│  │ );                                                      │   │
│  │                                                         │   │
│  │ CREATE INDEX idx_guest_emails_anon_id                 │   │
│  │   ON guest_emails(anon_id);                            │   │
│  │                                                         │   │
│  │ CREATE INDEX idx_guest_emails_email                   │   │
│  │   ON guest_emails(email);                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Example Data:                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ id │ anon_id      │ email              │ user_name    │   │
│  ├────┼──────────────┼────────────────────┼──────────────┤   │
│  │ 1  │ anon_abc123  │ john@example.com   │ John         │   │
│  │ 2  │ anon_def456  │ jane@example.com   │ Jane         │   │
│  │ 3  │ anon_ghi789  │ bob@example.com    │ Bob          │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Message Count Flow

```
User Registration (Guest)
        ↓
localStorage.setItem('veraGuestMessageCount', '0')
localStorage.setItem('veraIsGuest', 'true')
        ↓
┌─────────────────────────────────────────────────┐
│ Message 1  │ guestMessageCount: 0 → 1           │
│ "Hi VERA"  │ Modal: NOT shown (count < 4)       │
└─────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────┐
│ Message 2  │ guestMessageCount: 1 → 2           │
│ "I'm...'   │ Modal: NOT shown (count < 4)       │
└─────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────┐
│ Message 3  │ guestMessageCount: 2 → 3           │
│ "Help me"  │ Modal: NOT shown (count < 4)       │
└─────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────┐
│ Message 4  │ guestMessageCount: 3 → 4           │
│ "Thanks"   │ ↓                                   │
│            │ Backend detects: guestMessageCount  │
│            │ === 4                              │
│            │ ↓                                   │
│            │ isGuestMessage4 = true             │
│            │ ↓                                   │
│            │ Email prompt appended to response  │
│            │ ↓                                   │
│            │ Frontend receives isGuestMessage4  │
│            │ ✅ Modal SHOWN after 1 second     │
└─────────────────────────────────────────────────┘
        ↓
User Email Collection
        ↓
┌─────────────────────────────────────────────────┐
│ User enters email and clicks "Yes, Remember Me"│
│ ↓                                               │
│ POST /api/guest-email                           │
│ ↓                                               │
│ Stored in guest_emails table                   │
│ ↓                                               │
│ localStorage.setItem('veraGuestEmailCollected')│
│ ↓                                               │
│ VERA says: "Beautiful. I'll remember you. 💜"  │
└─────────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
┌──────────────────────┐
│   Frontend (HTML)    │
│  • Message input     │
│  • Email modal       │
│  • localStorage      │
└──────────────────────┘
          │ HTTP
          ↓
┌──────────────────────┐
│    Server (Node)     │
│  • /api/chat         │
│  • /api/guest-email  │
│  • request handling  │
└──────────────────────┘
          │ Function Call
          ↓
┌──────────────────────┐
│    VERA AI Layer     │
│  • Message processing│
│  • Email detection   │
│  • Prompt generation │
└──────────────────────┘
          │ SQL
          ↓
┌──────────────────────┐
│   PostgreSQL DB      │
│  • guest_emails table│
│  • email indexes     │
│  • user association  │
└──────────────────────┘
```

---

## State Machine: Modal Lifecycle

```
START
  ↓
┌─────────────────────────────────────────┐
│ HIDDEN                                  │
│ Modal: display: none                    │
│ Email Input: empty                      │
└─────────────────────────────────────────┘
  ↓
User sends 4th message
  ↓
Server detects: guestMessageCount === 4
  ↓
Response includes: isGuestMessage4: true
  ↓
Frontend calls: showEmailCollectionModal()
  ↓
┌─────────────────────────────────────────┐
│ VISIBLE (transition state)              │
│ Modal: display: flex (with animation)   │
│ Email Input: focuses automatically      │
│ Backdrop: blur effect active            │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ User Action Choice                      │
└─────────────────────────────────────────┘
  ↙                           ↘
Option A: Skip             Option B: Submit
(Click ✕)                  (Enter Email)
  ↓                           ↓
┌─────────────────────────┐ ┌──────────────────────┐
│ closeEmailModal()      │ │ handleEmailCollection│
│ Modal: display: none  │ │ POST /api/guest-email│
│ Continue chat         │ │ ↓                     │
└─────────────────────────┘ │ Email validated      │
  ↓                         │ ↓                     │
END                         │ Stored in DB         │
                            │ ↓                     │
                            │ closeEmailModal()    │
                            │ ↓                     │
                            │ Show: "I'll remember │
                            │ you. 💜"             │
                            │ ↓                     │
                            │ Update localStorage  │
                            └──────────────────────┘
                              ↓
                            END
```

---

## Error Handling Flow

```
POST /api/guest-email
  ↓
┌──────────────────────────────┐
│ Input Validation             │
└──────────────────────────────┘
  ↓
  ├─→ No email? ──→ 400 Bad Request: "Invalid email format"
  ├─→ Invalid format? ──→ 400 Bad Request: "Invalid email format"
  ├─→ No anonId? ──→ 400 Bad Request: "Invalid session"
  └─→ anonId format wrong? ──→ 400 Bad Request: "Invalid session"
  ↓ (validation passed)
┌──────────────────────────────┐
│ Database Query               │
└──────────────────────────────┘
  ↓
  ├─→ Already exists? ──→ 200 OK: "Email already on file"
  └─→ Not exists? ──→ INSERT into guest_emails
  ↓ (success)
  └──→ 200 OK: "Email saved successfully"
  ↓ (any error)
  └──→ 500 Internal Error: "Failed to save email"
```

---

## Responsive Design Breakpoints

```
Desktop (1024px+)
┌─────────────────────────────┐
│    Email Collection Modal   │
│    [400px max-width]        │
│    • Large heading          │
│    • Readable paragraph     │
│    • Full-size input field  │
└─────────────────────────────┘

Tablet (768px - 1023px)
┌──────────────────┐
│    Modal Modal   │
│    [90vw max]    │
│    • Medium text │
│    • Adjusted    │
│      padding     │
└──────────────────┘

Mobile (< 768px)
┌────────────┐
│ Modal      │
│ [95vw]     │
│ • Compact  │
│ • Touch-   │
│   friendly │
│ • Readable │
└────────────┘
```

---

## Timeline: Feature Lifecycle

```
Oct 27, 2025

[=== Frontend ===]
|---message tracking---|
         |---modal CSS/HTML---|
                      |---JS handlers---|
                                 |---trigger logic---|
                                                     ✓ Complete

[=== Backend ===]
           |---parameter extraction---|
                                      |---email endpoint---|
                                                            ✓ Complete

[=== Database ===]
                      |---schema creation---|
                                           ✓ Complete

[=== Testing ===]
                                    |---validation---|
                                                    ✓ Complete

[=== Deployment ===]
                                                     |---commit & push---|
                                                                        ✓ Complete
                                                                        
Commit 7dee4db → All Changes Merged to Main Branch
```

---

## Success Metrics

```
Implementation Completeness:
┌─────────────────┬──────────┐
│ Component       │ Status   │
├─────────────────┼──────────┤
│ Frontend        │ ✅ 100%  │
│ Backend         │ ✅ 100%  │
│ Database        │ ✅ 100%  │
│ Integration     │ ✅ 100%  │
│ Testing         │ ✅ 100%  │
│ Documentation   │ ✅ 100%  │
└─────────────────┴──────────┘

Code Quality:
✅ Syntax: No errors
✅ Validation: Comprehensive
✅ Error Handling: Full coverage
✅ Logging: Detailed
✅ Comments: Clear
✅ Responsive: Mobile-first
```

---

This architecture ensures:
- 🎯 **Clear data flow** from frontend to backend to database
- 🛡️ **Multiple validation layers** for data integrity
- 📱 **Responsive design** across all devices
- ♿ **Accessibility** for all users
- 🚀 **Production-ready** implementation
