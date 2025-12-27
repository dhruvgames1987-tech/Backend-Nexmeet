# 🔧 Rate Limiting Fixed + Credential Issues

**Date:** December 27, 2025

---

## 🚨 **Issues Found**

### **Issue 1: Rate Limiting Locks Out ALL Users** ❌

**Problem:**
- Rate limiting was **per IP address**
- 5 failed attempts from ANY user → ALL users at that IP locked for 15 minutes!
- Even successful logins counted toward the limit!

**Example scenario:**
- User A enters wrong password 5 times
- User B, C, D at same location can't login for 15 minutes!
- Even if User A gets the right password, still locked out!

---

### **Issue 2: Invalid Credentials**

Your mobile app login fails with "Invalid credentials" for `admin2` / `admin2`.

**Possible causes:**
1. User `admin2` doesn't exist in database
2. Password is different
3. Username is case-sensitive and might be `Admin2` or `ADMIN2`

---

## ✅ **Fix 1: Rate Limiting (APPLIED)**

Changed rate limiting from **per-IP** to **per-username**:

### **Before (Bad):**
```typescript
const loginLimiter = rateLimit({
    max: 5,                              // 5 attempts per IP
    skipSuccessfulRequests: false,       // Counts successful logins too!
    // Uses IP address by default
});
```

**Problem:** One user's mistakes lock out everyone!

### **After (Good):** ✅
```typescript
const loginLimiter = rateLimit({
    max: 10,                             // 10 attempts per username
    skipSuccessfulRequests: true,        // Only count failed attempts
    keyGenerator: (req) => {
        return req.body?.username || req.ip;  // Rate limit by username!
    },
});
```

**Benefits:**
- ✅ Each username gets 10 attempts
- ✅ One user can't lock out others
- ✅ Successful logins don't count
- ✅ Still protects against brute force on individual accounts

---

## 🔍 **Fix 2: Check Your Credentials**

### **Option A: Check via Admin Panel**

1. Open admin panel in browser
2. Go to **Users** tab
3. Look for user with username `admin2`
4. Check exact username (case-sensitive!)
5. Check if user exists

### **Option B: Check via Supabase Dashboard**

1. Go to: https://wcrkufjrqpqxicswfdmp.supabase.co
2. Navigate to **Table Editor** → **users** table
3. Search for username: `admin2`
4. Check:
   - ✅ Does user exist?
   - ✅ What's the exact username? (Admin2? ADMIN2? admin2?)
   - ✅ What's the password? (Passwords are stored in plain text in your current setup)
   - ✅ Is `device_lock` enabled?
   - ✅ Is user assigned to a room? (`current_room_id` should not be null)

---

## 🧪 **Testing Rate Limiting Fix**

### **Test 1: Wrong Password Multiple Times (Same User)**

```bash
# Try wrong password 10 times with username "testuser"
for i in {1..10}; do
  echo "Attempt $i:"
  curl -s -X POST https://api.dhruvmusic.co.in/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","password":"wrong","deviceId":"test","deviceName":"Test"}' \
    | jq -r '.error'
done
```

**Expected:**
- First 10 attempts: "Invalid credentials"
- 11th attempt: "Too many login attempts. Please try again in 15 minutes."

### **Test 2: Different Users (Should NOT Lock Each Other)**

```bash
# User A - wrong password 5 times
for i in {1..5}; do
  curl -s -X POST https://api.dhruvmusic.co.in/login \
    -H "Content-Type: application/json" \
    -d '{"username":"userA","password":"wrong","deviceId":"test","deviceName":"Test"}' \
    | jq -r '.error'
done

# User B - should still be able to try logging in!
curl -s -X POST https://api.dhruvmusic.co.in/login \
  -H "Content-Type: application/json" \
  -d '{"username":"userB","password":"test","deviceId":"test","deviceName":"Test"}' \
  | jq -r '.error'
```

**Expected:**
- User A gets rate limited after 10 attempts
- User B can still login (NOT affected by User A's failures)

---

## ✅ **Deployment Steps**

### **1. Deploy Backend Changes**

The rate limiting fix needs to be deployed to your server:

```bash
cd backend

# If using Docker:
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### **2. Verify Deployment**

```bash
# Test that backend is running with new config
curl https://api.dhruvmusic.co.in/health
```

---

## 🔐 **Find Valid Credentials**

### **Method 1: Create a Test User (Recommended)**

Use admin panel to create a new test user:

1. Open admin panel
2. Users → Add User
3. Fill in:
   - **Username:** `testuser`
   - **Password:** `test123`
   - **Full Name:** Test User
   - **Role:** user
   - **Select Room:** (choose any room)
   - **Device Lock:** OFF (unchecked)
4. Save

Then try logging in with:
- Username: `testuser`
- Password: `test123`

### **Method 2: Check Existing Users**

**Via Supabase Dashboard:**
1. Go to: https://wcrkufjrqpqxicswfdmp.supabase.co
2. Table Editor → users
3. Click on any user row to see details
4. Note the exact `username` and `password`

**Via Admin Panel:**
1. Open admin panel
2. Users tab
3. Check existing usernames
4. Passwords are not shown in admin panel (security feature)

---

## 🚨 **Current Rate Limit Status**

Based on your last test:
```
ratelimit-remaining: 2
```

You have **2 login attempts left** before being locked out for 15 minutes!

**Options:**
1. **Wait 15 minutes** for rate limit to reset
2. **Deploy the fix** to get fresh rate limits
3. **Use different username** (if the fix is deployed, each username has separate limits)

---

## 📋 **Checklist**

- [x] **Rate limiting fixed** - Per username instead of per IP
- [x] **Code updated** - backend/src/index.ts
- [ ] **Deploy to server** - Need to rebuild/restart backend
- [ ] **Find valid credentials** - Check Supabase or create test user
- [ ] **Test login** - After deployment

---

## 🎯 **Recommended Next Steps**

1. **Deploy Backend Changes:**
   ```bash
   cd backend
   docker-compose up -d --build
   ```

2. **Create Test User:**
   - Use admin panel
   - Username: `testuser`
   - Password: `test123`
   - Device lock: OFF
   - Assign to a room

3. **Test Mobile Login:**
   - Try with test user credentials
   - Should work after backend is deployed!

4. **Check Existing Credentials:**
   - Look in Supabase dashboard
   - Find the actual `admin2` password
   - Or create new admin user

---

## 🆘 **Troubleshooting**

### **Still Getting "Invalid Credentials"**

1. **Double-check username (case-sensitive!):**
   - `admin2` ≠ `Admin2` ≠ `ADMIN2`

2. **Check in Supabase:**
   - Does user exist?
   - What's the exact password?

3. **Verify user has required fields:**
   - `current_room_id` should not be null
   - User should be assigned to a room

### **"Too Many Login Attempts"**

**If you see this before deploying the fix:**
- Wait 15 minutes
- Or deploy backend with the fix
- Or try a different username

**After deploying the fix:**
- Each username gets separate rate limit
- 10 attempts per username
- Only failed attempts count

---

## 📊 **Rate Limiting Comparison**

| Feature | Before (Bad) | After (Good) ✅ |
|---------|--------------|----------------|
| **Scope** | Per IP | Per Username |
| **Max Attempts** | 5 | 10 |
| **Counts Success?** | Yes | No |
| **Lockout Effect** | All users at IP | Only that username |
| **Security** | Moderate | Better |
| **User Experience** | Poor | Good |

---

## 🔒 **Security Note**

The new rate limiting:
- ✅ Prevents brute force on individual accounts
- ✅ Doesn't punish other users for one user's mistakes
- ✅ Only counts failed attempts
- ✅ Still protects against attackers

**But remember:**
- You should also implement CAPTCHA for additional security
- Consider adding account lockout after X failed attempts
- Passwords should be hashed (currently plain text - security risk!)

---

**Deploy the fix and create a test user to verify everything works!**
