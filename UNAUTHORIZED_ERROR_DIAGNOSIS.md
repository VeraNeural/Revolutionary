# 🔐 "Unauthorized" Error Diagnosis

**Error**: `{"error":"Unauthorized"}`  
**Date**: October 28, 2025

---

## 📋 Endpoints Requiring Authentication

### 1. **GET /monitoring**
- **Requires**: Bearer token in `Authorization` header
- **Token**: Value of `MONITOR_KEY` env var (default: 'vera-monitor-key')
- **Example**:
  ```bash
  curl -H "Authorization: Bearer vera-monitor-key" https://app.veraneural.com/monitoring
  ```

### 2. **POST /api/chat** (with restrictions)
- **Status**: Generally public but may have rate limiting
- **Authentication**: Optional (can send as guest)
- **Requires**: Valid message in body

### 3. **POST /api/history**
- **Status**: Protected if authenticated (checks req.session)
- **Returns 401**: If accessing another user's history without permission

### 4. **GET /admin/leads**
- **Status**: Admin protected
- **Requires**: Admin authentication
- **Returns 401**: If not admin user

---

## ✅ Public Endpoints (No Auth Required)

- `GET /health` - Always public ✅
- `GET /version` - Always public ✅
- `GET /` - Homepage ✅
- `GET /intro` - Introduction page ✅
- `GET /chat` - Chat page ✅
- `GET /subscribe` - Subscribe page ✅
- `POST /api/auth/send-magic-link` - Public auth ✅
- `GET /verify-magic-link` - Public verification ✅

---

## 🔍 Troubleshooting Steps

**If you're getting "Unauthorized" error:**

1. **Check which endpoint is failing**
   - Is it `/monitoring`? → Need Bearer token
   - Is it `/admin/leads`? → Need admin credentials
   - Is it `/api/history`? → Need valid session
   - Is it `/api/chat`? → Check message payload

2. **For /monitoring endpoint**:
   ```bash
   # Test with correct token
   curl -H "Authorization: Bearer vera-monitor-key" \
     https://app.veraneural.com/monitoring
   ```

3. **For authenticated endpoints**:
   - Verify session cookie is being sent
   - Check if user has valid session
   - Try `/api/auth/check` to verify session status

4. **Check Rate Limiting**:
   - Some endpoints may have rate limiting
   - Check `lib/rate-limiter.js` for limits
   - Wait and retry if rate limited

---

## 🛠️ Common Issues

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| 401 on /monitoring | No/wrong Bearer token | Add correct `Authorization` header |
| 401 on /api/chat | Rate limiting | Wait a moment and retry |
| 401 on /admin/leads | Not admin | Use admin user credentials |
| 401 on /api/history | Invalid session | Login with magic link first |

---

## 📝 Next Steps

1. **Identify the exact endpoint** that's returning 401
2. **Check the endpoint requirements** above
3. **Verify authentication headers/session** are correct
4. **Test with curl/Postman** if needed

---

**Need more info?** Check:
- `lib/rate-limiter.js` - Rate limiting rules
- `server.js` line 1117 - /monitoring auth
- `server.js` line 1739 - /api/auth/check
