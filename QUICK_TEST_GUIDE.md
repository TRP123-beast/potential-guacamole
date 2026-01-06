# Quick Test Guide - Auto-Booking System

## 🚀 Quick Start (5 minutes)

> **Note:** This guide is for **local development**. For Railway deployment, both services start automatically - see `RAILWAY_DEPLOYMENT.md`.

### Step 1: Start the Dashboard Server
```bash
npm run dashboard
```

Expected output:
```
🚀 Dashboard Server Running
📊 Dashboard URL: http://localhost:3000
```

### Step 2: Start the Auto-Booking Worker
Open a **new terminal** in the same directory:
```bash
npm run worker
```

Expected output:
```
╔═══════════════════════════════════════════════════════════╗
║    🤖 Auto-Booking Worker Started (Event-Driven Mode)    ║
╚═══════════════════════════════════════════════════════════╝

🎯 Listening for new showing_requests in Supabase...
⏰ Default booking time: 8:00 PM
📅 Default booking date: Current day

✅ Successfully subscribed to showing_requests changes
   Waiting for INSERT events...
```

### Step 3: Open the Dashboard
Navigate to: **http://localhost:3000/auto-book**

You should see:
- ✅ Auto-Booking Queue Status card (at top)
- ✅ Stats showing 0 pending, 0 completed, etc.
- ✅ "For Manual Booking" section below

---

## 🧪 Test 1: Single Auto-Booking

### Insert a Test Record in Supabase

**Option A: Supabase Dashboard SQL Editor**
```sql
INSERT INTO showing_requests (property_id, status, user_id)
VALUES ('test_property_001', 'pending', 'test_user_123');
```

**Option B: Using Supabase API/Client**
```javascript
const { data, error } = await supabase
  .from('showing_requests')
  .insert([
    { property_id: 'test_property_001', status: 'pending' }
  ]);
```

### What Should Happen

**In Worker Terminal (immediately):**
```
🔔 New showing request detected!
   ID: <uuid>
   Property ID: test_property_001
   Status: pending

➕ Added to queue: test_property_001 (Queue size: 1)

═══════════════════════════════════════════════════════════
📦 Processing booking <uuid>
   Property ID: test_property_001
   Queue remaining: 0
═══════════════════════════════════════════════════════════

✓ Fetched address: <address from API>

🚀 Starting auto-book: <address> at 8:00 PM
  📝 [Auto-booking script logs...]
  ✅ Auto-booking completed successfully

✅ Queue processed. Waiting for new records...
```

**In Dashboard UI (within 5 seconds):**
- Queue stats update
- Pending changes to Processing → Completed
- Status badge turns green with ✅

---

## 🧪 Test 2: Multiple Bookings (Queue Test)

### Insert Multiple Records Quickly
```sql
INSERT INTO showing_requests (property_id, status) 
VALUES 
  ('test_property_002', 'pending'),
  ('test_property_003', 'pending'),
  ('test_property_004', 'pending');
```

### Expected Behavior

**Worker:**
- Detects all 3 inserts
- Queues them: "Queue size: 1", "Queue size: 2", "Queue size: 3"
- Processes them **one at a time** (sequential)
- Each completes before next starts

**Dashboard:**
- Pending count increases: 3
- As each processes: Pending decreases, Completed increases
- Visual queue shows all items with status badges

---

## 🧪 Test 3: Manual Booking (Verify It Still Works)

### In Dashboard UI:
1. Scroll to "Start a new booking run" card
2. Enter: `266 Brant Avenue` (or any test address)
3. Optional: Set time to `10:00 AM`
4. Click "Launch automation"

### Expected:
- Job status card updates to "Running"
- Live activity log shows progress
- Manual booking completes independently of auto-worker

---

## 🔍 Verify Everything Works

### Check Database
```bash
node inspect-db.js
```

Look for:
- `processed_showing_requests` table has new records
- `auto_booked = 1` for auto-booked items
- `booking_status = 'completed'` for successful bookings
- `bookings` table has new entries from auto-book script

### Check API Endpoint
```bash
curl http://localhost:3000/api/auto-booking-queue
```

Should return JSON with:
```json
{
  "success": true,
  "data": {
    "pending": [...],
    "completed": [...]
  },
  "stats": {
    "completedCount": 1
  }
}
```

---

## 🎯 Success Criteria

✅ **Worker Starts Clean**
- No errors on startup
- "Successfully subscribed" message appears
- Checks for existing unprocessed records

✅ **Events Detected**
- INSERT triggers immediately
- Correct property_id logged
- Added to queue

✅ **Address Resolution**
- Property API called
- Address fetched and cached
- Normalized for search

✅ **Auto-Booking Executes**
- Booking script runs
- Default time: 8:00 PM
- Default date: Current day
- Completes without errors

✅ **Status Tracking**
- Database updated correctly
- `auto_booked = 1`
- `booking_status = 'completed'`

✅ **UI Updates**
- Stats refresh (5s interval)
- Queue items appear
- Status badges correct
- Colors match status

✅ **Manual Booking Intact**
- Can still book manually
- No conflicts with worker
- All features work

---

## ❌ Common Issues & Fixes

### Worker: "Missing Supabase credentials"
**Fix**: Check `.env` file has:
```bash
SUPABASE_PROJECT_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Worker: Starts but no "Successfully subscribed"
**Fix**: 
1. Enable Realtime in Supabase dashboard
2. Check table name is exactly `showing_requests`
3. Verify permissions allow subscription

### Worker: "Failed to fetch address"
**Fix**:
- Property API might be slow/down
- Check property_id is valid
- Worker will skip and mark as `failed_no_address`

### Auto-booking fails every time
**Fix**:
1. Test manual booking first
2. Check BrokerBay is logged in (browser profile)
3. Verify `BROWSER_PROFILE_USERDATA` in .env
4. Run with `HEADLESS=false` to see what happens

### Dashboard shows 0 items but worker processed
**Fix**:
- Wait 5 seconds for auto-refresh
- Check browser console for errors
- Verify server is running on correct port

---

## 🎉 You're Done!

If all tests pass:
- ✅ Event-driven system working
- ✅ Queue handling multiple requests
- ✅ Auto-booking with defaults
- ✅ UI showing real-time updates
- ✅ Manual booking still functional

**The system is ready for production use!**

---

## 📝 Next Steps

1. **Monitor in Production**
   - Keep worker terminal open
   - Watch for errors
   - Check queue periodically

2. **Adjust Defaults** (if needed)
   - Edit `auto-booking-worker.js` line 157 for time
   - Edit `auto-booking-worker.js` line 159 for date logic

3. **Scale Up**
   - Worker can handle bursts of requests
   - Queue processes sequentially (safe)
   - No rate limiting issues

4. **Customize**
   - Add email notifications
   - Integrate with other systems
   - Modify booking logic

---

## 🆘 Still Having Issues?

1. Check all logs:
   - Worker terminal
   - Dashboard terminal  
   - Browser console (F12)

2. Inspect database:
   ```bash
   npm run show:tables
   ```

3. Test components individually:
   ```bash
   # Test property API
   npm run fetch:addresses
   
   # Test manual booking
   npm run auto-book "266 Brant Avenue"
   ```

4. Review guides:
   - `AUTO_BOOKING_GUIDE.md` - Full system guide
   - `CHANGES_SUMMARY.md` - What changed
   - `README.md` - Original setup

**Happy auto-booking!** 🎉

